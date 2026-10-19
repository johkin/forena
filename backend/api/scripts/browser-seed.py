#!/usr/bin/env python3
"""Explicit create/snapshot/cleanup of this run's isolated browser fixtures. No email.

Uses the pinned JDK and JDBC jar downloaded by the API build; Python stdlib only.
Private state includes synthetic login credentials. Keep it in ignored target/work.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import urllib.request
import urllib.error
import urllib.parse
import uuid

ROOT = Path(__file__).resolve().parents[3]
REF = "ckzrtxqjskosqzoitymc"
ISSUER = f"https://{REF}.supabase.co/auth/v1"


class SeedError(RuntimeError):
    """Only credential-free diagnostics may be raised as SeedError."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def write_state(path, state):
    temporary = path.with_suffix(".tmp")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as out:
        json.dump(state, out)
    temporary.replace(path)


def jdbc(operation, path, state):
    if os.environ.get("FORENA_TEST_TARGET_REF") != REF or state["project_ref"] != REF:
        raise SeedError("Explicitly select the isolated test project")
    if os.environ.get("FORENA_TEST_OWNER_USERNAME") != f"forena_api_owner.{REF}":
        raise SeedError("Use the isolated schema owner's pooler credential")
    url = os.environ.get("FORENA_TEST_JDBC_URL", "")
    p = urllib.parse.urlsplit(url.removeprefix("jdbc:"))
    if not url.startswith("jdbc:postgresql://") or p.hostname != "aws-1-eu-central-1.pooler.supabase.com" or p.port != 5432 or p.path != "/postgres" or p.username or p.password:
        raise SeedError("Use the verified isolated session pooler URL without credentials")
    q = urllib.parse.parse_qs(p.query)
    if any(k.lower() in ("user", "password", "sslfactory", "sslhostnameverifier") for k in q):
        raise SeedError("Do not override credentials or TLS verification in the JDBC URL")
    q.update(sslmode=["verify-full"], sslrootcert=[str(ROOT / "backend/certs/supabase-ca.crt")], connectTimeout=["10"], socketTimeout=["30"])
    env = os.environ.copy()
    env["FORENA_TEST_JDBC_URL"] = "jdbc:" + urllib.parse.urlunsplit(p._replace(query=urllib.parse.urlencode(q, doseq=True)))
    jars = list((Path.home() / ".m2/repository/org/postgresql/postgresql").glob("*/postgresql-*.jar"))
    if len(jars) != 1:
        raise SeedError("Build the API with the pinned toolchain first")
    properties = path.with_suffix(".properties")
    properties.write_text("\n".join(f"{k}={uuid.UUID(v)}" for k, v in state["ids"].items()))
    java = str(Path(env["JAVA_HOME"]) / "bin/java") if env.get("JAVA_HOME") else "java"
    result = subprocess.run([java, "--class-path", str(jars[0]), str(ROOT / "backend/api/scripts/BrowserSeed.java"), operation, str(properties)], env=env, capture_output=True, text=True, timeout=60)
    if result.returncode:
        # Do not print JDBC exception text or process environment.
        raise SeedError("Fixture SQL failed; credentials and JDBC exception text withheld")
    return json.loads(result.stdout) if result.stdout.strip() else None


def auth(method, path, body=None, expected=200):
    secret = os.environ.get("FORENA_TEST_AUTH_SECRET_KEY", "")
    if not secret or secret.startswith("sb_publishable_"):
        raise SeedError("Configure the isolated Auth admin key in the environment")
    request = urllib.request.Request(ISSUER + path, method=method,
        headers={"apikey": secret, "Content-Type": "application/json"},
        data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=15) as response:
            status, data = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, data = error.code, error.read()
    if status != expected:
        raise SeedError(f"Auth {method} {path.split('?')[0]}: HTTP {status}, expected {expected}")
    return json.loads(data) if data else {}


def cleanup(path, state):
    failures = []
    try:
        jdbc("cleanup", path, state)
    except Exception:
        failures.append("database cleanup")
    for subject in state["users"]:
        try:
            # Idempotent recovery: allow an account already deleted by a prior cleanup.
            try:
                auth("GET", f"/admin/users/{subject}")
            except SeedError:
                auth("GET", f"/admin/users/{subject}", expected=404)
            else:
                auth("DELETE", f"/admin/users/{subject}", {"should_soft_delete": False})
                auth("GET", f"/admin/users/{subject}", expected=404)
        except Exception:
            failures.append("Auth cleanup")
    if failures:
        raise SeedError("Incomplete " + ", ".join(failures) + "; keep the private recovery state")
    state["cleaned"] = True
    state.pop("password", None)
    write_state(path, state)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["create", "snapshot", "cleanup"])
    parser.add_argument("--state", type=Path, default=ROOT / "backend/api/target/browser-seed.json")
    args = parser.parse_args()
    path = args.state.resolve()
    if not any(path.is_relative_to(ROOT / parent) for parent in ("work", "backend/api/target")):
        raise SeedError("Private state must be under ignored work/ or backend/api/target/")
    if os.environ.get("FORENA_TEST_TARGET_REF") != REF:
        raise SeedError("Explicitly select the isolated test project")
    if args.operation != "create":
        state = json.loads(path.read_text())
        if state["project_ref"] != REF:
            raise SeedError("Recovery state belongs to a different project")
        if args.operation == "snapshot":
            print(json.dumps(jdbc("snapshot", path, state)))
        else:
            cleanup(path, state)
            print(json.dumps({"cleaned": True}))
        return
    if path.exists():
        raise SeedError("State already exists; clean up that run before creating another")
    path.parent.mkdir(parents=True, exist_ok=True)
    run = str(uuid.uuid4())
    state = {"project_ref": REF, "run_id": run, "password": f"Browser-{uuid.uuid4()}-9!", "users": [], "emails": [f"forena-browser-{run}-{i}@example.invalid" for i in range(2)], "ids": {key: str(uuid.uuid4()) for key in ["org", "team", "activity", "foreignActivity", "child0", "child1", "foreignChild", "invitation0", "invitation1", "foreignInvitation"]}}
    write_state(path, state)
    try:
        # Establish the exact owner/TLS/project/migration connection before creating Auth users.
        jdbc("snapshot", path, state)
        for i, email in enumerate(state["emails"]):
            user = auth("POST", "/admin/users", {"email": email, "password": state["password"], "email_confirm": True})
            subject = str(uuid.UUID(user["id"]))
            state["users"].append(subject)
            state["ids"][f"account{i}"] = subject
            write_state(path, state)
        jdbc("create", path, state)
    except Exception:
        cleanup(path, state)
        raise
    print(json.dumps({"created": True, "activity_id": state["ids"]["activity"], "state_file": str(path)}))


if __name__ == "__main__":
    try:
        main()
    except SeedError as error:
        raise SystemExit(str(error))
    except Exception:
        raise SystemExit("Seed operation failed; credential-bearing diagnostics withheld")
