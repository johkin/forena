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
import urllib.parse
import xml.etree.ElementTree as ET
import uuid


ROOT = Path(__file__).resolve().parents[2]
JAR = ROOT / "backend/target/forena-api.jar"
JAVA = str(Path(os.environ["JAVA_HOME"]) / "bin/java")


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
    parser.add_argument("--trace-native-metadata", type=Path, help="Collect GraalVM tracing-agent metadata from the JVM runtime")
    parser.add_argument("--browser", action="store_true", help="Run real browser WebAuthn and OAuth against the selected runtime")
    parser.add_argument("--runtime-entrypoint", help="Run the application directly with synthetic local configuration")
    args = parser.parse_args()
    if args.trace_native_metadata and (args.runtime_image or args.runtime_executable):
        parser.error("Tracing metadata requires the JVM runtime")
    if args.runtime_entrypoint and not args.runtime_image:
        parser.error("--runtime-entrypoint requires --runtime-image")
    if not JAR.is_file():
        raise SystemExit("Build backend with Maven verify first")
    container = docker("run", "--rm", "-d", "-p", "127.0.0.1::5432", "-e",
                       "POSTGRES_PASSWORD=local-smoke-only", "postgres:17.6-alpine")
    runtime = runtime_container = None
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
        # Recreate an empty schema so JVM and native must migrate before serving HTTP.
        docker("exec", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c",
               "drop schema forena cascade; create schema forena authorization forena_api_owner; revoke all on schema forena from public")
        env.update(FORENA_INITIAL_SYSTEM_ADMIN_EMAIL="smoke@example.invalid", FORENA_MIGRATE="true", FORENA_MIGRATION_USERNAME="forena_api_owner",
                   FORENA_MIGRATION_PASSWORD="local-owner-only", PORT=str(http_port),
                   FORENA_WEB_SESSION_ENABLED="true", FORENA_WEB_ORIGIN="https://app.example.invalid",
                   FORENA_WEB_SESSION_KEY=base64.b64encode(bytes(range(32))).decode(),
                   FORENA_DB_CA_CERTIFICATE=(ROOT / "backend/certs/supabase-ca.crt").read_text(),
                   FORENA_OAUTH_CLIENT_ID="mcp-test", FORENA_OAUTH_CLIENT_REDIRECT="https://client.example.invalid/callback",
                   FORENA_OAUTH_CLIENT_SECRET="synthetic-oauth-client-secret-for-auth-test",
                   RESEND_API_KEY="synthetic-unused-key", RESEND_FROM_EMAIL="auth@example.invalid",
                   SPRING_APPLICATION_JSON=json.dumps({"forena.authentication.mail-delay-ms": 3600000}))
        # Startup must fail before serving HTTP if the separate owner is unavailable.
        with tempfile.TemporaryFile(mode="w+") as log:
            result = subprocess.run([JAVA, "-jar", str(JAR)], env=env | {"FORENA_MIGRATION_PASSWORD": ""},
                                    stdout=log, stderr=subprocess.STDOUT, timeout=30)
            assert result.returncode != 0, "Startup accepted missing owner credentials"
            log.seek(0)
            output = log.read()
            assert "Migration owner password is required" in output
            assert "Tomcat started" not in output, "HTTP opened despite failed migration setup"
        with (ROOT / "backend/target/runtime-smoke.log").open("w+") as log:
            trace = ["-agentlib:native-image-agent=config-output-dir=" + str(args.trace_native_metadata.resolve())] if args.trace_native_metadata else []
            command = [JAVA, *trace, *(["-Dspring.aot.enabled=true"] if args.aot_runtime else []), "-jar", str(JAR)]
            if args.runtime_executable:
                command = [str(args.runtime_executable.resolve())]
            if args.runtime_image:
                # Host networking only connects the Linux test container to the
                # disposable PostgreSQL on loopback.
                runtime_keys = ("FORENA_INITIAL_SYSTEM_ADMIN_EMAIL", "FORENA_MIGRATE", "FORENA_MIGRATION_USERNAME", "FORENA_MIGRATION_PASSWORD", "PORT", "FORENA_DB_CA_CERTIFICATE", "FORENA_JDBC_URL", "FORENA_DB_USERNAME", "FORENA_DB_PASSWORD",
                                "RESEND_API_KEY", "RESEND_FROM_EMAIL", "SPRING_APPLICATION_JSON",
                                "FORENA_OAUTH_CLIENT_ID", "FORENA_OAUTH_CLIENT_REDIRECT", "FORENA_OAUTH_CLIENT_SECRET",
                                "FORENA_WEB_SESSION_ENABLED", "FORENA_WEB_ORIGIN", "FORENA_WEB_SESSION_KEY")
                entrypoint = ["--entrypoint", args.runtime_entrypoint] if args.runtime_entrypoint else []
                runtime_container = docker("create", "--network=host", *entrypoint,
                                           *[item for name in runtime_keys for item in ("-e", name)],
                                           args.runtime_image, env=env)
                command = ["docker", "start", "--attach", runtime_container]
            started = time.monotonic()
            runtime = subprocess.Popen(command, env=env, stdout=log, stderr=subprocess.STDOUT)
            deadline = time.monotonic() + (90 if args.trace_native_metadata else 30)
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
            def seed(sql):
                return docker("exec", container, "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql)

            def clear_limits():
                seed("delete from forena.auth_rate_limit")

            # Every mode uses the same Spring lifecycle; no external auth or email calls.
            origin = env["FORENA_WEB_ORIGIN"]
            cookie = None
            subject = None
            def call(path, body=None, *, form=False, status=200, bound=True, account=True, method=None):
                nonlocal cookie
                headers = {"Origin": origin, "X-Forena-Request": "1"} if bound else {}
                if cookie:
                    headers["Cookie"] = cookie
                if subject and account:
                    headers["X-Forena-Account"] = subject
                data = None
                if body is not None:
                    headers["Content-Type"] = "application/x-www-form-urlencoded" if form else "application/json"
                    data = (urllib.parse.urlencode(body) if form else json.dumps(body)).encode()
                request = urllib.request.Request(f"http://127.0.0.1:{http_port}{path}", data=data, headers=headers, method=method)
                try:
                    response = urllib.request.urlopen(request, timeout=10)
                except urllib.error.HTTPError as error:
                    response = error
                with response:
                    assert response.status == status, f"{path}: {response.status}, expected {status}"
                    assert response.headers.get("Cache-Control") and "no-store" in response.headers["Cache-Control"]
                    value = response.headers.get("Set-Cookie")
                    if value:
                        assert all(flag in value for flag in ("HttpOnly", "Secure", "SameSite=Lax"))
                        cookie = value.split(";", 1)[0]
                    if status == 429:
                        assert int(response.headers["Retry-After"]) > 0
                    return json.load(response)

            credentials = {"email": "smoke@example.invalid", "password": "synthetic-smoke-password"}
            call("/api/auth/register", credentials, bound=False, status=403)
            call("/api/auth/register", credentials)
            registration_cookie = cookie
            subject = seed("select subject from forena.native_user where email='smoke@example.invalid'")
            code = seed("select token_value from forena.one_time_tokens where username like 'verify:%'")
            assert seed("select count(*) from forena.auth_mail_outbox where encrypted_link like '%" + code + "%'") == "0"
            assert seed("select count(*) from forena.auth_mail_outbox where encrypted_link <> ''") == "1"
            call("/api/auth/login", credentials, form=True, status=401)
            cookie = None
            call("/api/auth/email/verify", {"code": code}, status=401)
            cookie = registration_cookie
            call("/api/auth/email/verify", {"code": code})
            call("/api/auth/email/verify", {"code": code}, status=401)
            clear_limits()
            call("/api/auth/login", credentials, form=True)
            assert cookie != registration_cookie
            active_cookie = cookie
            assert call("/api/auth/session")["user"]["id"] == subject
            empty = call("/api/me/overview")
            assert all(empty[name] == [] for name in ("activities", "organizations", "teams"))
            organization, team, person, activity, invitation = [str(uuid.uuid4()) for _ in range(5)]
            seed(f"""
insert into forena.organization(id,name) values('{organization}','Local club');
insert into forena.person(id,organization_id,display_name) values('{person}','{organization}','Local person');
insert into forena.person_access(person_id,organization_id,subject,kind) values('{person}','{organization}','{subject}','self');
insert into forena.team(id,organization_id,name) values('{team}','{organization}','Local team');
insert into forena.activity(id,organization_id,team_id,title,starts_at,ends_at) values('{activity}','{organization}','{team}','Local activity',now()+interval '1 hour',now()+interval '2 hours');
insert into forena.invitation(id,organization_id,activity_id,person_id) values('{invitation}','{organization}','{activity}','{person}');
""")
            overview = call("/api/me/overview")
            assert len(overview["activities"]) == 1 and overview["teams"] == []
            assert overview["activities"][0]["team"]["roles"] == []
            assert call(f"/api/activities/{activity}")["team"]["roles"] == []
            # Exercise the same commands in JVM, AOT and native-image releases.
            assert call("/api/me/managed-teams") == []
            seed(f"insert into forena.organization_member(organization_id,subject,role) values('{organization}','{subject}','admin')")
            seed(f"insert into forena.team_membership(organization_id,team_id,person_id,role,starts_on) values('{organization}','{team}','{person}','participant',current_date)")
            assert call("/api/me/managed-teams")[0]["id"] == team
            command = {"teamId": team, "title": "Managed smoke activity", "location": "Local pitch",
                       "startsAt": "2030-10-25T16:00:00Z", "endsAt": "2030-10-25T17:30:00Z",
                       "invitationMode": "now", "personIds": [person]}
            created = call("/api/activities", command, status=201)["activity"]
            managed_id = created["id"]
            assert created["revision"] == 0
            editor = call(f"/api/teams/{team}/activity-editor")
            assert any(item["id"] == managed_id for item in editor["activities"])
            assert editor["members"] and editor["types"] and editor["defaults"] == []
            assert seed(f"select count(*) from forena.activity_schedule where activity_id='{managed_id}' and state='pending'") == "1"
            update = command | {"title": "Updated smoke activity", "invitationMode": "none", "personIds": [], "revision": 0}
            assert call(f"/api/activities/{managed_id}", update, method="PUT")["activity"]["revision"] == 1
            call(f"/api/activities/{managed_id}", update, method="PUT", status=409)
            assert call(f"/api/activities/{managed_id}", {"revision": 1}, method="DELETE")["disposition"] == "cancelled"
            assert seed(f"select count(*) from forena.activity_audit where activity_id='{managed_id}'") == "3"
            assert seed(f"select count(*) from forena.activity_schedule where activity_id='{managed_id}' and state='pending'") == "0"
            print("PASS: activity create, scoped editor DTOs, update, revision conflict, cancellation, audit and durable schedule", flush=True)
            seed(f"update forena.person_access set active=false where subject='{subject}'")
            assert call("/api/me/activities")["activities"] == []
            assert call("/api/admin/overview")["canBootstrap"] is True
            call("/api/admin/bootstrap", {})
            call("/api/admin/bootstrap", {}, status=409)
            created_club = call("/api/admin/clubs", {
                "organizationName": "Admin smoke club", "organizationSlug": "admin-smoke-club", "timeZone": "Europe/Stockholm",
                "sectionName": "Football", "sectionSlug": "football", "disciplineKey": "football"})["id"]
            created_section = call("/api/admin/overview")["clubs"]
            created_section = next(item for item in created_section if item["id"] == created_club)["sections"][0]["id"]
            call(f"/api/admin/clubs/{created_club}/administrators", {"email": credentials["email"]})
            created_team = call(f"/api/admin/sections/{created_section}/teams", {"name": "Admin team"})["id"]
            call(f"/api/admin/teams/{created_team}/administrators", {"email": credentials["email"], "name": "Smoke leader"})
            admin_activity = call("/api/activities", {"teamId": created_team, "title": "Admin chain activity", "startsAt": "2030-10-25T16:00:00Z", "endsAt": "2030-10-25T17:00:00Z"}, status=201)["activity"]["id"]
            call(f"/api/activities/{admin_activity}", {}, method="DELETE")
            print("PASS: first system administrator → club/section → club administrator → team → team administrator → activity", flush=True)
            # Actual WebAuthn options exercise Spring's JSON mixins and string-only session storage.
            clear_limits()
            options = call("/api/auth/passkey/registration/options", {})
            assert "rp" in options, f"Native WebAuthn creation option fields: {sorted(options)}"
            assert options["rp"]["id"] == "app.example.invalid"
            assert options["authenticatorSelection"]["userVerification"] == "required"
            assert call("/api/auth/passkeys") == []
            call("/api/auth/logout", {}, form=True)
            cookie = active_cookie
            call("/api/auth/session", status=401)
            cookie = None
            clear_limits()
            for index in range(6):
                options = call("/api/auth/passkey/options", {}, status=200 if index < 5 else 429)
                if index < 5:
                    assert options["userVerification"] == "required" and "challenge" in options
            call("/api/auth/logout", {}, form=True)
            clear_limits()
            call("/api/auth/magic-link", {"username": credentials["email"]}, form=True)
            magic_cookie = cookie
            code = seed("select token_value from forena.one_time_tokens where username like 'login:%'")
            cookie = None
            call("/api/auth/magic-link/verify", {"token": code}, form=True, status=401)
            cookie = magic_cookie
            clear_limits()
            call("/api/auth/magic-link/verify", {"token": code}, form=True)
            call("/api/auth/session")
            clear_limits()
            call("/api/auth/password/reset-request", {"email": credentials["email"]})
            code = seed("select token_value from forena.one_time_tokens where username like 'reset:%'")
            call("/api/auth/password/reset", {"code": code, "password": "replacement-smoke-password"})
            call("/api/auth/session", status=401)
            clear_limits()
            call("/api/auth/login", credentials, form=True, status=401)
            credentials["password"] = "replacement-smoke-password"
            call("/api/auth/login", credentials, form=True)
            seed(f"update forena.account set enabled=false where subject='{subject}'")
            call("/api/auth/session", status=401)
            assert call("/.well-known/oauth-protected-resource/api/mcp")["resource"] == origin + "/api/mcp"
            print("PASS: real Spring signup, browser-bound email verification and magic link, password login/reset, protected cookies, logout, account ban, WebAuthn options, shared 429 limits, OAuth metadata and authorized business reads", flush=True)
            if args.browser:
                browser_email = "browser-smoke@example.invalid"
                class Mailbox(http.server.BaseHTTPRequestHandler):
                    def do_POST(self):
                        if self.path != "/reset-limits":
                            self.send_error(404)
                            return
                        clear_limits()
                        self.send_response(200)
                        self.end_headers()

                    def do_GET(self):
                        kind = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("kind", [""])[0]
                        if kind not in ("verify", "login", "reset"):
                            self.send_error(400)
                            return
                        code = seed(f"select token_value from forena.one_time_tokens where username like '{kind}:%' "
                                    f"and split_part(username,':',2)=(select subject::text from forena.native_user where email='{browser_email}') order by expires_at desc limit 1")
                        self.send_response(200)
                        self.send_header("Content-Type", "application/json")
                        self.end_headers()
                        self.wfile.write(json.dumps({"code": code}).encode())

                    def log_message(self, *_args):
                        pass

                mailbox = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Mailbox)
                thread = threading.Thread(target=mailbox.serve_forever, daemon=True)
                thread.start()
                with socket.socket() as available:
                    available.bind(("127.0.0.1", 0))
                    frontend_port = available.getsockname()[1]
                browser_env = {name: value for name, value in os.environ.items() if not name.startswith("FORENA_")}
                browser_env.update(FORENA_AUTH_API=f"http://127.0.0.1:{http_port}",
                                   FORENA_AUTH_MAILBOX=f"http://127.0.0.1:{mailbox.server_port}",
                                   FORENA_AUTH_FRONTEND=f"http://127.0.0.1:{frontend_port}",
                                   FORENA_AUTH_TEST_EMAIL=browser_email)
                if os.environ.get("FORENA_BROWSER_EXECUTABLE"):
                    browser_env["FORENA_BROWSER_EXECUTABLE"] = os.environ["FORENA_BROWSER_EXECUTABLE"]
                with tempfile.TemporaryFile(mode="w+") as frontend_log:
                    preview = subprocess.Popen(["npm", "run", "preview", "--workspace", "@forena/frontend", "--",
                                                "--host", "127.0.0.1", "--port", str(frontend_port)], cwd=ROOT,
                                               env=browser_env, stdout=frontend_log, stderr=subprocess.STDOUT,
                                               start_new_session=True)
                    try:
                        deadline = time.monotonic() + 20
                        while True:
                            try:
                                urllib.request.urlopen(f"http://127.0.0.1:{frontend_port}/", timeout=2).close()
                                break
                            except urllib.error.URLError:
                                assert preview.poll() is None and time.monotonic() < deadline, "Frontend preview did not start"
                                time.sleep(0.2)
                        clear_limits()
                        subprocess.run(["node", "scripts/migration/auth-browser.mjs"], cwd=ROOT, env=browser_env,
                                       check=True, timeout=180)
                    finally:
                        os.killpg(preview.pid, 15)
                        preview.wait(timeout=10)
                        mailbox.shutdown()
                        mailbox.server_close()
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
        print("PASS: fresh bootstrap; migration-only JAR twice; web startup migrates empty schema with separate owner/runtime credentials; one-shot runtime-only access verification and rejection without migration or HTTP; DB health; Spring authentication lifecycle; shared admission and 429; unrestricted logout; plaintext logs; shutdown")
    finally:
        if runtime_container is not None:
            docker("rm", "-f", runtime_container)
        if runtime is not None and runtime.poll() is None:
            runtime.kill()
            runtime.wait(timeout=10)
        docker("rm", "-f", container)


if __name__ == "__main__":
    main()
