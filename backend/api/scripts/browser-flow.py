#!/usr/bin/env python3
"""Opt-in browser → Next → Kotlin → isolated Supabase test. No deployment or email.

Prerequisites: pinned JAVA_HOME, npm ci, npx playwright install --with-deps chromium,
the six FORENA_TEST_* credentials and FORENA_TEST_TARGET_REF. Never source secrets
into the API/web child environments: they are explicitly scoped below.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import socket
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[3]
REF = "ckzrtxqjskosqzoitymc"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-build", action="store_true", help="Use API JAR and Next build made from this exact source/configuration")
    args = parser.parse_args()
    out = ROOT / "backend/api/target/browser-flow"
    out.mkdir(parents=True, exist_ok=True)
    (out / "results.json").unlink(missing_ok=True)
    if os.environ.get("FORENA_TEST_TARGET_REF") != REF:
        raise RuntimeError("Explicitly select the isolated test project")
    required = ["FORENA_TEST_AUTH_SECRET_KEY", "FORENA_TEST_JDBC_URL", "FORENA_TEST_OWNER_USERNAME", "FORENA_TEST_OWNER_PASSWORD", "FORENA_TEST_RUNTIME_USERNAME", "FORENA_TEST_RUNTIME_PASSWORD"]
    if not all(os.environ.get(name) for name in required):
        raise RuntimeError("Configure all six FORENA_TEST_* values in the test environment")
    if any(os.environ[f"FORENA_TEST_{role}_USERNAME"] != f"forena_api_{role.lower()}.{REF}" for role in ["OWNER", "RUNTIME"]):
        raise RuntimeError("Use the isolated owner/runtime pooler identities")
    raw = os.environ["FORENA_TEST_JDBC_URL"]
    parsed = urllib.parse.urlsplit(raw.removeprefix("jdbc:"))
    if not raw.startswith("jdbc:postgresql://") or parsed.hostname != "aws-1-eu-central-1.pooler.supabase.com" or parsed.port != 5432 or parsed.path != "/postgres" or parsed.username or parsed.password:
        raise RuntimeError("Use the verified isolated pooler URL without credentials")
    query = urllib.parse.parse_qs(parsed.query)
    if any(k.lower() in ["user", "password", "sslfactory", "sslhostnameverifier"] for k in query):
        raise RuntimeError("Do not override database authentication or TLS verification")
    query.update(sslmode=["verify-full"], sslrootcert=[str(ROOT / "backend/certs/supabase-ca.crt")], connectTimeout=["10"], socketTimeout=["30"])
    jdbc_url = "jdbc:" + urllib.parse.urlunsplit(parsed._replace(query=urllib.parse.urlencode(query, doseq=True)))
    public = dict(line.split("=", 1) for line in (ROOT / "backend/api/.env.target.example").read_text().splitlines() if line.startswith("FORENA_AUTH_"))
    manager = os.environ.copy()
    manager["FORENA_TEST_JDBC_URL"] = jdbc_url
    # Preserve proxy, CA and runtime guard variables; remove privileged app/test values.
    base = {k: v for k, v in manager.items() if not k.startswith("FORENA_TEST_") and k not in ["FORENA_DB_PASSWORD", "FORENA_MIGRATION_PASSWORD", "FORENA_MIGRATION_USERNAME", "FORENA_DB_USERNAME", "FORENA_JDBC_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"]}
    web_env = base | {"NEXT_PUBLIC_SUPABASE_URL": f"https://{REF}.supabase.co", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": public["FORENA_AUTH_PUBLISHABLE_KEY"], "FORENA_PARTICIPATION_BACKEND": "kotlin", "FORENA_KOTLIN_API_URL": "http://127.0.0.1:8080", "SITE_URL": "http://127.0.0.1:3000"}
    # Never attach a test to an unrelated server that already owns either port.
    for port in [8080, 3000]:
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", port))
    state = ROOT / "backend/api/target/browser-seed.json"
    if state.exists():
        if not json.loads(state.read_text()).get("cleaned"):
            raise RuntimeError("An unfinished seed exists; run browser-seed.py cleanup first")
        state.replace(state.with_name("browser-seed-previous.json"))

    def run(command, env, name, timeout=600):
        with (out / name).open("w") as log:
            result = subprocess.run(command, env=env, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, timeout=timeout)
        if result.returncode:
            raise RuntimeError(f"Stage {name} failed; see the private local log (never publish credentials or traces)")

    if not args.skip_build:
        run([str(ROOT / "backend/mvnw"), "-f", "backend/api/pom.xml", "--batch-mode", "--no-transfer-progress", "-DskipTests", "package"], base, "api-build.log")
        run(["npm", "run", "build"], web_env, "web-build.log")
    api = web = None
    logs = []
    try:
        run(["python3", "backend/api/scripts/browser-seed.py", "create"], manager, "seed.log", 90)
        ids = json.loads(state.read_text())["ids"]
        api_env = base | public | {"FORENA_JDBC_URL": jdbc_url, "FORENA_DB_USERNAME": manager["FORENA_TEST_RUNTIME_USERNAME"], "FORENA_DB_PASSWORD": manager["FORENA_TEST_RUNTIME_PASSWORD"], "PORT": "8080", "SERVER_ADDRESS": "127.0.0.1", "FORENA_MIGRATE": "false"}
        java = str(Path(base["JAVA_HOME"]) / "bin/java") if base.get("JAVA_HOME") else "java"
        logs.append((out / "api.log").open("w"))
        api = subprocess.Popen([java, "-jar", "backend/api/target/forena-api.jar"], cwd=ROOT, env=api_env, stdout=logs[-1], stderr=subprocess.STDOUT)
        logs.append((out / "web.log").open("w"))
        web = subprocess.Popen(["node", "node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3000"], cwd=ROOT, env=web_env | {"FORENA_KOTLIN_TEST_ACTIVITY_ID": ids["activity"]}, stdout=logs[-1], stderr=subprocess.STDOUT)
        for url, child in [("http://127.0.0.1:8080/actuator/health", api), ("http://127.0.0.1:3000/login?mode=password", web)]:
            for _ in range(80):
                if child.poll() is not None:
                    raise RuntimeError("A test server exited before readiness")
                try:
                    with urllib.request.urlopen(url, timeout=1) as response:
                        if response.status == 200:
                            break
                except Exception:
                    time.sleep(.25)
            else:
                raise RuntimeError("Test server readiness timeout")
        run(["node", "scripts/migration/browser-participation.mjs"], manager | {"FORENA_BROWSER_API_PID": str(api.pid)}, "browser.log", 240)
    finally:
        for child in [web, api]:
            if child and child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()
        for log in logs:
            log.close()
        if state.exists() and not json.loads(state.read_text()).get("cleaned"):
            run(["python3", "backend/api/scripts/browser-seed.py", "cleanup"], manager, "recovery-cleanup.log", 90)
    result = json.loads((out / "results.json").read_text())
    assert result["passed"] and result["cleanup_confirmed"]
    print(json.dumps({"passed": True, "checks": len(result["checks"]), "cleanup_confirmed": True}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Only this script's RuntimeErrors contain safe, intentional diagnostics.
        raise SystemExit(str(error) if type(error) is RuntimeError else "Browser run failed; private diagnostics withheld")
