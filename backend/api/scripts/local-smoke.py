#!/usr/bin/env python3
"""Exercise the built JAR's migration-only and runtime modes in a disposable local DB."""
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


ROOT = Path(__file__).resolve().parents[3]
JAR = ROOT / "backend/api/target/forena-api.jar"
JAVA = str(Path(os.environ["JAVA_HOME"]) / "bin/java")


class LocalKeys(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/auth/v1/.well-known/jwks.json":
            self.send_error(404)
            return
        # Public P-256 generator point, synthetic fixture only. No private key
        # or real Auth connection is needed by this packaged startup test.
        encode = lambda value: base64.urlsafe_b64encode(bytes.fromhex(value)).decode().rstrip("=")
        body = json.dumps({"keys": [{"kty": "EC", "crv": "P-256", "use": "sig", "alg": "ES256",
                                    "kid": "local-smoke",
                                    "x": encode("6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296"),
                                    "y": encode("4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5")}]}).encode()
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
    if not JAR.is_file():
        raise SystemExit("Build backend/api with Maven verify first")
    container = docker("run", "--rm", "-d", "-p", "127.0.0.1::5432", "-e",
                       "POSTGRES_PASSWORD=local-smoke-only", "postgres:17.6-alpine")
    runtime = keys = None
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
        bootstrap = (ROOT / "backend/api/scripts/bootstrap.sql").read_text()
        docker("exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", input=bootstrap + """
ALTER ROLE forena_api_owner LOGIN PASSWORD 'local-owner-only';
ALTER ROLE forena_api_runtime LOGIN PASSWORD 'local-runtime-only';
""")
        port = docker("port", container, "5432/tcp").rsplit(":", 1)[1]
        env = {name: value for name, value in os.environ.items() if not name.startswith("FORENA_TEST_")}
        env.update(FORENA_JDBC_URL=f"jdbc:postgresql://127.0.0.1:{port}/postgres",
                   FORENA_DB_USERNAME="forena_api_runtime", FORENA_DB_PASSWORD="local-runtime-only",
                   FORENA_MIGRATE="true", FORENA_MIGRATION_USERNAME="forena_api_owner",
                   FORENA_MIGRATION_PASSWORD="local-owner-only")
        with tempfile.TemporaryFile(mode="w+") as log:
            for _ in range(2):
                result = subprocess.run([JAVA, "-jar", str(JAR)], env=env, stdout=log, stderr=subprocess.STDOUT, timeout=30)
                assert result.returncode == 0, "Migration-only JAR failed"
            log.seek(0)
            assert "Tomcat started" not in log.read(), "Migration mode must not open HTTP"
        changes = docker("exec", container, "psql", "-U", "postgres", "-Atc", "select count(*) from forena.databasechangelog")
        assert changes == "5"
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
        env.pop("FORENA_MIGRATION_USERNAME")
        env.pop("FORENA_MIGRATION_PASSWORD")
        with socket.socket() as available:
            available.bind(("127.0.0.1", 0))
            http_port = available.getsockname()[1]
        keys = http.server.ThreadingHTTPServer(("127.0.0.1", 0), LocalKeys)
        keys.available = True
        threading.Thread(target=keys.serve_forever, daemon=True).start()
        issuer = f"http://127.0.0.1:{keys.server_port}/auth/v1"
        env.update(FORENA_MIGRATE="false", PORT=str(http_port),
                   FORENA_AUTH_PUBLISHABLE_KEY="sb_publishable_smoke_placeholder",
                   FORENA_AUTH_ISSUER=issuer, FORENA_AUTH_JWKS_URI=issuer + "/.well-known/jwks.json")
        with tempfile.TemporaryFile(mode="w+") as log:
            runtime = subprocess.Popen([JAVA, "-jar", str(JAR)], env=env, stdout=log, stderr=subprocess.STDOUT)
            deadline = time.monotonic() + 30
            while True:
                assert runtime.poll() is None, "Runtime JAR exited unexpectedly"
                try:
                    with urllib.request.urlopen(f"http://127.0.0.1:{http_port}/actuator/health", timeout=2) as health:
                        assert health.status == 200
                    break
                except urllib.error.URLError:
                    if time.monotonic() >= deadline:
                        raise
                    time.sleep(0.2)
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
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{http_port}/api/activities/00000000-0000-0000-0000-000000000001/my-invitations", timeout=2)
                raise AssertionError("Private API accepted missing bearer")
            except urllib.error.HTTPError as error:
                assert error.code == 401
            runtime.terminate()
            assert runtime.wait(timeout=10) == 143
            runtime = None
        print("PASS: fresh bootstrap; migration-only JAR twice; runtime without owner credential; DB/Auth health and recovery; bearer rejection; shutdown")
    finally:
        if runtime is not None and runtime.poll() is None:
            runtime.kill()
            runtime.wait(timeout=10)
        if keys is not None:
            keys.shutdown()
            keys.server_close()
        docker("rm", "-f", container)


if __name__ == "__main__":
    main()
