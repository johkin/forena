#!/usr/bin/env python3
"""Exercise JAR migrations and a JVM, native binary or container runtime in a disposable local DB."""
import argparse
import os
import base64
import http.server
import json
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import threading
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import uuid


ROOT = Path(__file__).resolve().parents[2]
JAR = ROOT / "backend/target/forena-api.jar"
JAVA = str(Path(os.environ["JAVA_HOME"]) / "bin/java")


def encoded(value):
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def fixture_token(issuer, subject, session, private_key):
    header = encoded(json.dumps({"alg": "ES256", "kid": "local-smoke", "typ": "JWT"}).encode())
    claims = encoded(json.dumps({"iss": issuer, "sub": subject, "aud": "authenticated",
                                 "role": "authenticated", "session_id": session, "is_anonymous": False,
                                 "iat": int(time.time()), "exp": int(time.time()) + 300}).encode())
    message = f"{header}.{claims}"
    signature = subprocess.run(["openssl", "dgst", "-sha256", "-sign", str(private_key)],
                               input=message.encode(), capture_output=True, check=True).stdout
    # OpenSSL emits ASN.1 DER integers; JWT ES256 uses two fixed-width integers.
    assert signature[0] == 0x30 and signature[2] == 0x02
    r_end = 4 + signature[3]
    assert signature[r_end] == 0x02
    r = int.from_bytes(signature[4:r_end], "big").to_bytes(32, "big")
    s = int.from_bytes(signature[r_end + 2:], "big").to_bytes(32, "big")
    return f"{message}.{encoded(r + s)}"


class LocalKeys(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/auth/v1/passkeys/authentication/options" or not getattr(self.server, "passkey_success", False):
            self.send_error(501)
            return
        self.rfile.read(int(self.headers.get("Content-Length", "0")))
        body = json.dumps({"challenge_id": str(uuid.uuid4()), "expires_at": int(time.time()) + 300,
                           "options": {"challenge": "synthetic", "rpId": "local-smoke.example.invalid"}}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/auth/v1/user":
            body = json.dumps({"id": self.server.subject, "is_anonymous": False}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path != "/auth/v1/.well-known/jwks.json":
            self.send_error(404)
            return
        body = json.dumps({"keys": [self.server.jwk]}).encode()
        self.send_response(200 if self.server.available else 503)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


def docker(*args, **kwargs):
    result = subprocess.run(["docker", *args], text=True, capture_output=True, **kwargs)
    if result.returncode:
        raise RuntimeError(f"Local Docker command failed: {result.stderr}")
    return result.stdout.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    runtime_mode = parser.add_mutually_exclusive_group()
    runtime_mode.add_argument("--aot-runtime", action="store_true", help="Run the JVM web process with the generated native AOT graph")
    runtime_mode.add_argument("--runtime-image", help="Linux Docker image to run instead of the JVM web process")
    runtime_mode.add_argument("--runtime-executable", type=Path, help="Run a locally compiled native binary instead of the JVM web process")
    parser.add_argument("--runtime-entrypoint", help="Run the application directly with synthetic local configuration")
    args = parser.parse_args()
    if args.runtime_entrypoint and not args.runtime_image:
        parser.error("--runtime-entrypoint requires --runtime-image")
    if not JAR.is_file():
        raise SystemExit("Build backend with Maven verify first")
    container = docker("run", "--rm", "-d", "-p", "127.0.0.1::5432", "-e",
                       "POSTGRES_PASSWORD=local-smoke-only", "postgres:17.6-alpine")
    runtime = keys = runtime_container = None
    try:
        deadline = time.monotonic() + 30
        while True:
            try:
                docker("exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres")
                break
            except RuntimeError:
                if time.monotonic() >= deadline:
                    raise
                time.sleep(0.2)
        bootstrap = (ROOT / "backend/scripts/bootstrap.sql").read_text()
        docker("exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", input=bootstrap + """
ALTER ROLE forena_api_owner LOGIN PASSWORD 'local-owner-only';
ALTER ROLE forena_api_runtime LOGIN PASSWORD 'local-runtime-only';
""")
        port = docker("port", container, "5432/tcp").rsplit(":", 1)[1]
        env = {name: value for name, value in os.environ.items() if not name.startswith("FORENA_TEST_")}
        env.update(FORENA_JDBC_URL=f"jdbc:postgresql://127.0.0.1:{port}/postgres",
                   FORENA_DB_USERNAME="forena_api_runtime", FORENA_DB_PASSWORD="local-runtime-only",
                   FORENA_MIGRATE_ONLY="true", FORENA_MIGRATION_USERNAME="forena_api_owner",
                   FORENA_MIGRATION_PASSWORD="local-owner-only")
        with tempfile.TemporaryFile(mode="w+") as log:
            for _ in range(2):
                result = subprocess.run([JAVA, "-jar", str(JAR)], env=env, stdout=log, stderr=subprocess.STDOUT, timeout=30)
                assert result.returncode == 0, "Migration-only JAR failed"
            log.seek(0)
            assert "Tomcat started" not in log.read(), "Migration mode must not open HTTP"
        changes = docker("exec", container, "psql", "-U", "postgres", "-Atc", "select count(*) from forena.databasechangelog")
        changelog = ET.parse(ROOT / "backend/src/main/resources/db/changelog.xml")
        expected_changes = len(changelog.findall("{http://www.liquibase.org/xml/ns/dbchangelog}changeSet"))
        assert changes == str(expected_changes), "Packaged migrations must match the release changelog"
        session_columns = docker("exec", container, "psql", "-U", "postgres", "-Atc",
                                 "select count(*) from information_schema.columns where table_schema='forena' "
                                 "and table_name='invitation_history' and column_name='session_id'")
        assert session_columns == "0", "Login sessions must not be stored in business history"
        functions = docker("exec", container, "psql", "-U", "postgres", "-Atc",
                           "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='forena'")
        assert functions == "0", "Business logic must not live in database functions or procedures"
        triggers = docker("exec", container, "psql", "-U", "postgres", "-Atc",
                          "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid "
                          "join pg_namespace n on n.oid=c.relnamespace where n.nspname='forena' and not t.tgisinternal")
        assert triggers == "0", "Business logic must not live in custom database triggers"
        rls = docker("exec", container, "psql", "-U", "postgres", "-Atc",
                     "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace "
                     "where n.nspname='forena' and (c.relrowsecurity or c.relforcerowsecurity)")
        assert rls == "0", "Business API authorization must not depend on RLS"
        env.pop("FORENA_MIGRATE_ONLY")
        env.pop("FORENA_MIGRATION_USERNAME")
        env.pop("FORENA_MIGRATION_PASSWORD")
        # Separate release verification uses runtime only, opens no HTTP and never migrates.
        verification_env = env | {"FORENA_MIGRATE": "false", "FORENA_VERIFY_DATABASE_ACCESS": "true"}
        history_sql = "select string_agg(id||':'||md5sum, ',' order by orderexecuted) from forena.databasechangelog"
        history_before = docker("exec", container, "psql", "-U", "postgres", "-Atc", history_sql)
        with tempfile.TemporaryFile(mode="w+") as log:
            result = subprocess.run([JAVA, "-jar", str(JAR)], env=verification_env, stdout=log, stderr=subprocess.STDOUT, timeout=30)
            assert result.returncode == 0, "Runtime-only release verification failed"
            log.seek(0)
            assert "Tomcat started" not in log.read(), "Release verification must not open HTTP"
        docker("exec", container, "psql", "-U", "postgres", "-c", "revoke insert on forena.team from forena_api_runtime")
        try:
            with tempfile.TemporaryFile(mode="w+") as log:
                result = subprocess.run([JAVA, "-jar", str(JAR)], env=verification_env, stdout=log, stderr=subprocess.STDOUT, timeout=30)
                assert result.returncode != 0, "Release verification accepted missing grants"
                log.seek(0)
                output = log.read()
                assert "Runtime database access verification failed" in output, "Missing safe verification failure"
                assert "Tomcat started" not in output, "Failed release verification must not open HTTP"
        finally:
            docker("exec", container, "psql", "-U", "postgres", "-c", "grant insert on forena.team to forena_api_runtime")
        assert docker("exec", container, "psql", "-U", "postgres", "-Atc", history_sql) == history_before, "Verification changed migration history"
        with socket.socket() as available:
            available.bind(("127.0.0.1", 0))
            http_port = available.getsockname()[1]
        keys = http.server.ThreadingHTTPServer(("127.0.0.1", 0), LocalKeys)
        keys.available = True
        threading.Thread(target=keys.serve_forever, daemon=True).start()
        issuer = f"http://127.0.0.1:{keys.server_port}/auth/v1"
        keys.subject = str(uuid.uuid4())
        with tempfile.TemporaryDirectory() as signing:
            private_key = Path(signing) / "key.pem"
            subprocess.run(["openssl", "ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", str(private_key)], check=True)
            public = subprocess.run(["openssl", "pkey", "-in", str(private_key), "-pubout", "-outform", "DER"],
                                    capture_output=True, check=True).stdout[-65:]
            assert public[0] == 4
            keys.jwk = {"kty": "EC", "crv": "P-256", "use": "sig", "alg": "ES256", "kid": "local-smoke",
                        "x": encoded(public[1:33]), "y": encoded(public[33:])}
            bearer = fixture_token(issuer, keys.subject, str(uuid.uuid4()), private_key)
        # Recreate an empty schema so JVM and native must migrate before serving HTTP.
        docker("exec", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c",
               "drop schema forena cascade; create schema forena authorization forena_api_owner; revoke all on schema forena from public")
        env.update(FORENA_MIGRATE="true", FORENA_MIGRATION_USERNAME="forena_api_owner",
                   FORENA_MIGRATION_PASSWORD="local-owner-only", PORT=str(http_port),
                   FORENA_WEB_SESSION_ENABLED="true", FORENA_WEB_ORIGIN="https://local-smoke.example.invalid",
                   FORENA_WEB_SESSION_KEY=base64.b64encode(bytes(range(32))).decode(),
                   FORENA_DB_CA_CERTIFICATE=(ROOT / "backend/certs/supabase-ca.crt").read_text(),
                   FORENA_AUTH_PUBLISHABLE_KEY="sb_publishable_smoke_placeholder",
                   FORENA_AUTH_ISSUER=issuer, FORENA_AUTH_JWKS_URI=issuer + "/.well-known/jwks.json")
        # Startup must fail before serving HTTP if the separate owner is unavailable.
        with tempfile.TemporaryFile(mode="w+") as log:
            result = subprocess.run([JAVA, "-jar", str(JAR)], env=env | {"FORENA_MIGRATION_PASSWORD": ""},
                                    stdout=log, stderr=subprocess.STDOUT, timeout=30)
            assert result.returncode != 0, "Startup accepted missing owner credentials"
            log.seek(0)
            output = log.read()
            assert "Migration owner password is required" in output
            assert "Tomcat started" not in output, "HTTP opened despite failed migration setup"
        with tempfile.TemporaryFile(mode="w+") as log:
            command = [JAVA, *(["-Dspring.aot.enabled=true"] if args.aot_runtime else []), "-jar", str(JAR)]
            if args.runtime_executable:
                command = [str(args.runtime_executable.resolve())]
            if args.runtime_image:
                # Host networking only connects the Linux test container to the
                # disposable PostgreSQL and synthetic JWKS server on loopback.
                runtime_keys = ("FORENA_MIGRATE", "FORENA_MIGRATION_USERNAME", "FORENA_MIGRATION_PASSWORD", "PORT", "FORENA_DB_CA_CERTIFICATE", "FORENA_JDBC_URL", "FORENA_DB_USERNAME", "FORENA_DB_PASSWORD",
                                "FORENA_AUTH_PUBLISHABLE_KEY", "FORENA_AUTH_ISSUER", "FORENA_AUTH_JWKS_URI",
                                "FORENA_WEB_SESSION_ENABLED", "FORENA_WEB_ORIGIN", "FORENA_WEB_SESSION_KEY")
                entrypoint = ["--entrypoint", args.runtime_entrypoint] if args.runtime_entrypoint else []
                runtime_container = docker("create", "--network=host", *entrypoint,
                                           *[item for name in runtime_keys for item in ("-e", name)],
                                           args.runtime_image, env=env)
                command = ["docker", "start", "--attach", runtime_container]
            started = time.monotonic()
            runtime = subprocess.Popen(command, env=env, stdout=log, stderr=subprocess.STDOUT)
            deadline = time.monotonic() + 30
            while True:
                if runtime.poll() is not None or time.monotonic() >= deadline:
                    log.seek(0)
                    raise AssertionError("Runtime failed to become healthy:\n" + log.read())
                try:
                    with urllib.request.urlopen(f"http://127.0.0.1:{http_port}/actuator/health", timeout=2) as health:
                        assert health.status == 200
                    break
                except urllib.error.URLError:
                    if time.monotonic() >= deadline:
                        raise
                    time.sleep(0.2)
            assert docker("exec", container, "psql", "-U", "postgres", "-Atc", "select count(*) from forena.databasechangelog") == str(expected_changes), "HTTP opened before migrations completed"
            print(f"Runtime healthy after {time.monotonic() - started:.3f}s", flush=True)
            keys.available = False
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{http_port}/actuator/health", timeout=2)
                raise AssertionError("Health accepted an unavailable key provider")
            except urllib.error.HTTPError as error:
                assert error.code == 503
            finally:
                keys.available = True
            with urllib.request.urlopen(f"http://127.0.0.1:{http_port}/actuator/health", timeout=2) as health:
                assert health.status == 200
            def read_private(path):
                request = urllib.request.Request(f"http://127.0.0.1:{http_port}{path}", headers={"Authorization": f"Bearer {bearer}"})
                try:
                    with urllib.request.urlopen(request, timeout=5) as response:
                        assert response.status == 200 and response.headers["Cache-Control"] == "no-store"
                        return json.load(response)
                except urllib.error.HTTPError as error:
                    log.seek(0)
                    raise AssertionError(f"GET {path} returned {error.code}:\n" + log.read()) from error

            def seed(sql):
                docker("exec", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql)

            seed(f"insert into forena.account(subject) values('{keys.subject}')")
            empty = read_private("/api/me/overview")
            assert all(empty[name] == [] for name in ("activities", "organizations", "teams"))
            organization, team, person, activity = [str(uuid.uuid4()) for _ in range(4)]
            seed(f"""
insert into forena.organization(id,name) values('{organization}','Local club');
insert into forena.person(id,organization_id,display_name) values('{person}','{organization}','Local person');
insert into forena.person_access(person_id,organization_id,subject,kind) values('{person}','{organization}','{keys.subject}','self');
insert into forena.team(id,organization_id,name) values('{team}','{organization}','Local team');
insert into forena.activity(id,organization_id,team_id,title,starts_at,ends_at) values('{activity}','{organization}','{team}','Local activity',now()+interval '1 hour',now()+interval '2 hours');
insert into forena.invitation(id,organization_id,activity_id,person_id) values('{uuid.uuid4()}','{organization}','{activity}','{person}');
""")
            overview = read_private("/api/me/overview")
            assert len(overview["activities"]) == 1 and overview["teams"] == []
            assert overview["activities"][0]["team"]["roles"] == []
            assert len(overview["activities"][0]["people"]) == 1
            assert overview["activities"][0]["people"][0]["invitation"]["response"] == "pending"
            assert overview["activities"][0]["people"][0]["invitation"]["response_comment"] is None
            assert read_private(f"/api/activities/{activity}")["team"]["roles"] == []
            seed(f"update forena.activity set invitation_send_at=now()+interval '1 hour' where id='{activity}'")
            assert read_private(f"/api/activities/{activity}/my-invitations")["invitations"] == []
            seed(f"update forena.person_access set active=false where subject='{keys.subject}'")
            assert read_private("/api/me/activities")["activities"] == []
            print("PASS: authenticated empty overview, invitation-only activity with empty team roles, details and revoked-access empty lists", flush=True)
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{http_port}/api/activities/00000000-0000-0000-0000-000000000001/my-invitations", timeout=2)
                raise AssertionError("Private API accepted missing bearer")
            except urllib.error.HTTPError as error:
                assert error.code == 401
            # The synthetic provider has no POST handler. Five admitted calls fail
            # closed with 503; the sixth must be rejected locally before Auth.
            headers = {"Content-Type": "application/json", "Origin": env["FORENA_WEB_ORIGIN"], "X-Forena-Request": "1"}
            for index in range(6):
                request = urllib.request.Request(f"http://127.0.0.1:{http_port}/api/auth/passkey/options",
                                                 data=b"{}", headers=headers, method="POST")
                try:
                    urllib.request.urlopen(request, timeout=3)
                    raise AssertionError("Synthetic Auth failure was accepted")
                except urllib.error.HTTPError as error:
                    expected_status = 503 if index < 5 else 429
                    if error.code != expected_status:
                        log.seek(0)
                        raise AssertionError(f"Auth admission returned {error.code}, expected {expected_status}:\n" + log.read()) from error
                    assert error.headers.get("Cache-Control") == "no-store"
                    if index == 5:
                        assert int(error.headers["Retry-After"]) > 0
            logout = urllib.request.Request(f"http://127.0.0.1:{http_port}/api/auth/logout",
                                            data=b"{}", headers=headers, method="POST")
            with urllib.request.urlopen(logout, timeout=3) as result:
                assert json.load(result) == {"ok": True}, "Rate limiting must not block logout"
            # Exercise framework persistence, String serialization and protected cookie in JAR/native.
            docker("exec", container, "psql", "-U", "postgres", "-c",
                   "update forena.auth_rate_limit set available_at=clock_timestamp()-interval '1 second'")
            keys.passkey_success = True
            options = urllib.request.Request(f"http://127.0.0.1:{http_port}/api/auth/passkey/options",
                                             data=b"{}", headers=headers, method="POST")
            with urllib.request.urlopen(options, timeout=3) as result:
                assert "challenge_id" in json.load(result)
                cookie = result.headers["Set-Cookie"]
                assert all(flag in cookie for flag in ("HttpOnly", "Secure", "SameSite=Lax"))
                assert "Max-Age=86400" in cookie, "The session cookie must persist for one day"
            assert docker("exec", container, "psql", "-U", "postgres", "-Atc",
                          "select count(*) from forena.spring_session_attributes") == "1"
            logout.add_header("Cookie", cookie.split(";", 1)[0])
            with urllib.request.urlopen(logout, timeout=3) as result:
                assert json.load(result) == {"ok": True}
                assert "Max-Age=0" in result.headers["Set-Cookie"]
            assert docker("exec", container, "psql", "-U", "postgres", "-Atc",
                          "select count(*) from forena.spring_session") == "0"
            if runtime_container:
                docker("stop", "--time=10", runtime_container)
                assert runtime.wait(timeout=10) in (0, 143), "Container shutdown failed"
            else:
                runtime.terminate()
                assert runtime.wait(timeout=10) == 143
            runtime = None
            log.seek(0)
            startup = [line for line in log if "Started " in line]
            assert startup and all(" INFO " in line and not line.lstrip().startswith("{") for line in startup), \
                "Runtime must emit plaintext startup logs"
        print("PASS: fresh bootstrap; migration-only JAR twice; web startup migrates empty schema with separate owner/runtime credentials; one-shot runtime-only access verification and rejection without migration or HTTP; DB/Auth health; shared Auth admission and 429; unrestricted logout; bearer rejection; plaintext logs; shutdown")
    finally:
        if runtime_container is not None:
            docker("rm", "-f", runtime_container)
        if runtime is not None and runtime.poll() is None:
            runtime.kill()
            runtime.wait(timeout=10)
        if keys is not None:
            keys.shutdown()
            keys.server_close()
        docker("rm", "-f", container)


if __name__ == "__main__":
    main()
