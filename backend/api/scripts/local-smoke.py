#!/usr/bin/env python3
"""Exercise JAR migrations and a JAR or container runtime in a disposable local DB."""
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


class LocalTraces(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        self.server.batches.append((self.path, self.headers.get("Content-Type"), body))
        self.send_response(200)
        self.send_header("Content-Type", "application/x-protobuf")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *_args):
        pass


def docker(*args, **kwargs):
    result = subprocess.run(["docker", *args], text=True, capture_output=True, **kwargs)
    if result.returncode:
        raise RuntimeError(f"Local Docker command failed: {result.stderr}")
    return result.stdout.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime-image", help="Linux Docker image to run instead of the JVM web process")
    parser.add_argument("--runtime-entrypoint", help="Run the application directly with synthetic local configuration")
    args = parser.parse_args()
    if args.runtime_entrypoint and not args.runtime_image:
        parser.error("--runtime-entrypoint requires --runtime-image")
    if not JAR.is_file():
        raise SystemExit("Build backend/api with Maven verify first")
    container = docker("run", "--rm", "-d", "-p", "127.0.0.1::5432", "-e",
                       "POSTGRES_PASSWORD=local-smoke-only", "postgres:17.6-alpine")
    runtime = keys = traces = runtime_container = None
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
        changelog = ET.parse(ROOT / "backend/api/src/main/resources/db/changelog.xml")
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
        env.pop("FORENA_MIGRATION_USERNAME")
        env.pop("FORENA_MIGRATION_PASSWORD")
        with socket.socket() as available:
            available.bind(("127.0.0.1", 0))
            http_port = available.getsockname()[1]
        keys = http.server.ThreadingHTTPServer(("127.0.0.1", 0), LocalKeys)
        keys.available = True
        threading.Thread(target=keys.serve_forever, daemon=True).start()
        traces = http.server.ThreadingHTTPServer(("127.0.0.1", 0), LocalTraces)
        traces.batches = []
        threading.Thread(target=traces.serve_forever, daemon=True).start()
        issuer = f"http://127.0.0.1:{keys.server_port}/auth/v1"
        env.update(FORENA_MIGRATE="false", PORT=str(http_port),
                   FORENA_WEB_SESSION_ENABLED="true", FORENA_WEB_ORIGIN="https://local-smoke.example.invalid",
                   FORENA_WEB_SESSION_KEY=base64.b64encode(bytes(range(32))).decode(),
                   FORENA_DB_CA_CERTIFICATE=(ROOT / "backend/certs/supabase-ca.crt").read_text(),
                   FORENA_AUTH_PUBLISHABLE_KEY="sb_publishable_smoke_placeholder",
                   MANAGEMENT_OPENTELEMETRY_TRACING_EXPORT_OTLP_ENDPOINT=f"http://127.0.0.1:{traces.server_port}/v1/traces",
                   FORENA_AUTH_ISSUER=issuer, FORENA_AUTH_JWKS_URI=issuer + "/.well-known/jwks.json")
        with tempfile.TemporaryFile(mode="w+") as log:
            command = [JAVA, "-jar", str(JAR)]
            if args.runtime_image:
                # Host networking only connects the Linux test container to the
                # disposable PostgreSQL and synthetic JWKS server on loopback.
                runtime_keys = ("PORT", "FORENA_DB_CA_CERTIFICATE", "FORENA_JDBC_URL", "FORENA_DB_USERNAME", "FORENA_DB_PASSWORD",
                                "FORENA_AUTH_PUBLISHABLE_KEY", "FORENA_AUTH_ISSUER", "FORENA_AUTH_JWKS_URI",
                                "MANAGEMENT_OPENTELEMETRY_TRACING_EXPORT_OTLP_ENDPOINT",
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
            if runtime_container:
                docker("stop", "--time=10", runtime_container)
                assert runtime.wait(timeout=10) in (0, 143), "Container shutdown failed"
            else:
                runtime.terminate()
                assert runtime.wait(timeout=10) == 143
            runtime = None
            assert traces.batches, "Runtime must export HTTP request spans"
            assert all(path == "/v1/traces" and content_type == "application/x-protobuf" and body
                       for path, content_type, body in traces.batches), "Expected OTLP HTTP/protobuf batches"
            assert any(b"forena-api" in body for _, _, body in traces.batches), "Trace resource must identify the API"
            log.seek(0)
            structured = [json.loads(line) for line in log if line.startswith("{")]
            assert any(entry.get("ecs", {}).get("version") and entry.get("service", {}).get("name") == "forena-api"
                       for entry in structured), "Runtime must emit ECS console logs"
        print("PASS: fresh bootstrap; migration-only JAR twice; runtime without owner credential; DB/Auth/session health; shared Auth admission and 429; unrestricted logout; bearer rejection; OTLP HTTP/protobuf spans; ECS logs; shutdown")
    finally:
        if runtime_container is not None:
            docker("rm", "-f", runtime_container)
        if runtime is not None and runtime.poll() is None:
            runtime.kill()
            runtime.wait(timeout=10)
        if keys is not None:
            keys.shutdown()
            keys.server_close()
        if traces is not None:
            traces.shutdown()
            traces.server_close()
        docker("rm", "-f", container)


if __name__ == "__main__":
    main()
