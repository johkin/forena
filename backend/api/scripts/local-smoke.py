#!/usr/bin/env python3
"""Exercise the built JAR's migration-only and runtime modes in a disposable local DB."""
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request


ROOT = Path(__file__).resolve().parents[3]
JAR = ROOT / "backend/api/target/forena-api.jar"
JAVA = str(Path(os.environ["JAVA_HOME"]) / "bin/java")


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
    runtime = None
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
ALTER ROLE forena_api_owner PASSWORD 'local-owner-only';
ALTER ROLE forena_api_runtime PASSWORD 'local-runtime-only';
""")
        port = docker("port", container, "5432/tcp").rsplit(":", 1)[1]
        env = os.environ.copy()
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
        assert changes == "4"
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
        env.update(FORENA_MIGRATE="false", PORT=str(http_port),
                   FORENA_AUTH_ISSUER="https://example.invalid/auth/v1",
                   FORENA_AUTH_JWKS_URI="https://example.invalid/auth/v1/.well-known/jwks.json")
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
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{http_port}/api/activities/00000000-0000-0000-0000-000000000001/my-invitations", timeout=2)
                raise AssertionError("Private API accepted missing bearer")
            except urllib.error.HTTPError as error:
                assert error.code == 401
            runtime.terminate()
            assert runtime.wait(timeout=10) == 143
            runtime = None
        print("PASS: fresh bootstrap; migration-only JAR twice; runtime without owner credential; health; bearer rejection; shutdown")
    finally:
        if runtime is not None and runtime.poll() is None:
            runtime.kill()
            runtime.wait(timeout=10)
        docker("rm", "-f", container)


if __name__ == "__main__":
    main()
