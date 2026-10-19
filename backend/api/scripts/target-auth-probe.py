#!/usr/bin/env python3
"""Real Auth-only probe. No database access, emails, or persistent test accounts.

Requires cryptography and FORENA_TEST_AUTH_SECRET_KEY in the environment.
Explicitly select the isolated project with FORENA_TEST_TARGET_REF.
Response bodies and credentials must never be logged.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, padding, rsa
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

REF = "ckzrtxqjskosqzoitymc"
ISSUER = f"https://{REF}.supabase.co/auth/v1"
ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "backend/api/target/target-auth-provider-results.json"


class ProbeError(RuntimeError):
    """Only explicit, credential-free diagnostics may use this type."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    EVIDENCE.unlink(missing_ok=True)
    if os.environ.get("FORENA_TEST_TARGET_REF") != REF:
        raise ProbeError("Explicitly select the isolated test project with FORENA_TEST_TARGET_REF")
    secret = os.environ.get("FORENA_TEST_AUTH_SECRET_KEY")
    if not secret:
        raise ProbeError("Configure FORENA_TEST_AUTH_SECRET_KEY in the environment")
    if secret.startswith("sb_publishable_"):
        raise ProbeError("FORENA_TEST_AUTH_SECRET_KEY contains a publishable key; configure the test project's sb_secret_ key")
    public_config = ROOT / "backend/api/.env.target.example"
    publishable = next(line.split("=", 1)[1] for line in public_config.read_text().splitlines()
                       if line.startswith("FORENA_AUTH_PUBLISHABLE_KEY="))
    opener = urllib.request.build_opener(NoRedirect())
    observations = []
    users = []
    passed = False
    run_id = str(uuid.uuid4())
    password = f"Target-{uuid.uuid4()}-9!"

    def auth(method, path, body=None, bearer=None, admin=False):
        key = secret if admin else publishable
        headers = {"apikey": key, "Content-Type": "application/json", "Cache-Control": "no-store"}
        if bearer is not None:
            headers["Authorization"] = "Bearer " + bearer
        request = urllib.request.Request(ISSUER + path, method=method, headers=headers,
                                        data=None if body is None else json.dumps(body).encode())
        try:
            with opener.open(request, timeout=15) as response:
                status, data = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, data = error.code, error.read()
        return status, json.loads(data) if data else {}

    def expect(method, path, body=None, bearer=None, admin=False, status=200):
        actual, data = auth(method, path, body, bearer, admin)
        if actual != status:
            raise ProbeError(f"Auth {method} {path.split('?')[0]}: HTTP {actual}, expected {status}")
        return data

    def observe(label, token, active):
        status, data = auth("GET", "/user", bearer=token)
        code = data.get("error_code")
        # Only safe, known error codes are retained. Never retain arbitrary provider text.
        known = {"bad_jwt", "session_not_found", "user_not_found", "user_banned", "session_expired"}
        ok = (status == 200 and data.get("id") == users[0] and data.get("is_anonymous") is False
              if active else status in (401, 403) and code in known)
        observations.append({"check": label, "http_status": status,
                             "error_code": code if code in known else None, "passed": ok})

    def refresh_denied(label, session):
        status, _ = auth("POST", "/token?grant_type=refresh_token",
                         {"refresh_token": session["refresh_token"]})
        observations.append({"check": label, "http_status": status, "passed": status in (400, 401, 403)})

    def verify_signature(token):
        def decode(value):
            return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
        header64, claims64, signature64 = token.split(".")
        header, claims = json.loads(decode(header64)), json.loads(decode(claims64))
        jwks = expect("GET", "/.well-known/jwks.json")
        jwk = next(key for key in jwks["keys"] if key["kid"] == header["kid"])
        signature, payload = decode(signature64), f"{header64}.{claims64}".encode()
        number = lambda name: int.from_bytes(decode(jwk[name]), "big")
        if header["alg"] == "ES256" and jwk["kty"] == "EC" and jwk["crv"] == "P-256":
            key = ec.EllipticCurvePublicNumbers(number("x"), number("y"), ec.SECP256R1()).public_key()
            if len(signature) != 64:
                raise RuntimeError("Invalid ES256 signature length")
            signature = encode_dss_signature(int.from_bytes(signature[:32], "big"),
                                             int.from_bytes(signature[32:], "big"))
            key.verify(signature, payload, ec.ECDSA(hashes.SHA256()))
        elif header["alg"] == "RS256" and jwk["kty"] == "RSA":
            key = rsa.RSAPublicNumbers(number("e"), number("n")).public_key()
            key.verify(signature, payload, padding.PKCS1v15(), hashes.SHA256())
        else:
            raise RuntimeError("Expected ES256 or RS256")
        audience = claims.get("aud")
        if not (claims["iss"] == ISSUER and audience in ("authenticated", ["authenticated"])
                and claims["sub"] == users[0] and claims["role"] == "authenticated"
                and claims["is_anonymous"] is False and claims["iat"] <= time.time() < claims["exp"]):
            raise RuntimeError("Unexpected signed claims")
        uuid.UUID(claims["session_id"])
        observations.append({"check": "real-jwks-signature-and-claims", "algorithm": header["alg"], "passed": True})

    try:
        email = f"forena-auth-{run_id}@example.invalid"
        user = expect("POST", "/admin/users", {"email": email, "password": password,
                      "email_confirm": True}, admin=True)
        users.append(str(uuid.UUID(user["id"])))

        def login():
            return expect("POST", "/token?grant_type=password", {"email": email, "password": password})

        first = login()
        verify_signature(first["access_token"])
        observe("password-login", first["access_token"], True)
        refreshed = expect("POST", "/token?grant_type=refresh_token", {"refresh_token": first["refresh_token"]})
        observe("refresh", refreshed["access_token"], True)
        second = login()
        expect("POST", "/logout?scope=local", bearer=refreshed["access_token"], status=204)
        observe("local-logout-original-jwt-denied", first["access_token"], False)
        observe("local-logout-refreshed-jwt-denied", refreshed["access_token"], False)
        refresh_denied("local-logout-refresh-denied", refreshed)
        observe("local-logout-other-session-preserved", second["access_token"], True)
        third = login()
        observe("relogin", third["access_token"], True)
        expect("POST", "/logout?scope=global", bearer=third["access_token"], status=204)
        for label, session in [("other", second), ("current", third)]:
            observe(f"global-logout-{label}-jwt-denied", session["access_token"], False)
            refresh_denied(f"global-logout-{label}-refresh-denied", session)
        banned = login()
        expect("PUT", f"/admin/users/{users[0]}", {"ban_duration": "1h"}, admin=True)
        observe("provider-ban-jwt-denied", banned["access_token"], False)
        refresh_denied("provider-ban-refresh-denied", banned)
        expect("PUT", f"/admin/users/{users[0]}", {"ban_duration": "none"}, admin=True)
        deleted = login()
        observe("unban-relogin", deleted["access_token"], True)
        expect("DELETE", f"/admin/users/{users[0]}", {"should_soft_delete": True}, admin=True)
        observe("provider-soft-delete-jwt-denied", deleted["access_token"], False)
        refresh_denied("provider-soft-delete-refresh-denied", deleted)
        passed = all(item["passed"] for item in observations)
    finally:
        # Cleanup even after an assertion/network failure; never print response bodies.
        for user_id in users:
            expect("DELETE", f"/admin/users/{user_id}", {"should_soft_delete": False}, admin=True)
            status, _ = auth("GET", f"/admin/users/{user_id}", admin=True)
            if status != 404:
                raise RuntimeError("Auth fixture cleanup not confirmed")
        observations.append({"check": "synthetic-user-hard-delete-confirmed", "passed": True})

    result = {"project_ref": REF, "checked_at": datetime.now(timezone.utc).isoformat(),
              "source_commit": os.environ.get("FORENA_TEST_SOURCE_COMMIT"),
              "probe_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              "scope": "auth-provider-only", "passed": passed, "checks": observations,
              "not_tested": ["kotlin-api", "cloud-jdbc", "liquibase", "family-isolation",
                             "rejected-write-history", "email-delivery", "browser-pkce", "passkeys",
                             "oauth-mcp", "timebox-inactivity-single-session", "cloud-runtime"]}
    EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ProbeError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        # Avoid exception messages from HTTP/JSON/crypto libraries containing secrets.
        print(f"Auth probe aborted ({type(error).__name__}); no passing evidence generated", file=sys.stderr)
        sys.exit(1)
