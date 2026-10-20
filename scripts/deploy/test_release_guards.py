"""Execute release boundaries with synthetic poisoned environments; no network."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
AUTH = "https://ckzrtxqjskosqzoitymc.supabase.co"
JDBC = "jdbc:postgresql://aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=/app/supabase-ca.crt"


class ReleaseGuards(unittest.TestCase):
    def run_entrypoint(self, script, **overrides):
        with tempfile.TemporaryDirectory() as directory:
            # Intercept env itself so the production executable need not exist.
            recorder = Path(directory) / "env"
            recorder.write_text("#!/usr/bin/python3\nimport json,sys\nprint(json.dumps(sys.argv[1:]))\n")
            recorder.chmod(0o755)
            environment = dict(os.environ, PATH=directory + ":" + os.environ["PATH"],
                               NEXT_PUBLIC_SUPABASE_URL=AUTH,
                               NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_publishable_synthetic",
                               SITE_URL="https://forena-kotlin.vercel.app",
                               FORENA_KOTLIN_SERVICE_URL="http://bound-api.internal/service/backend/",
                               FORENA_DB_USERNAME="forena_api_runtime.ckzrtxqjskosqzoitymc",
                               FORENA_JDBC_URL=JDBC, FORENA_DB_PASSWORD="synthetic-runtime",
                               SUPABASE_SECRET_KEY="poison-admin", FORENA_TEST_AUTH_SECRET_KEY="poison-test",
                               FORENA_MIGRATION_PASSWORD="poison-owner", FORENA_MIGRATE="true",
                               JAVA_TOOL_OPTIONS="poison-java", SPRING_APPLICATION_JSON="poison-spring",
                               NODE_OPTIONS="poison-node", NODE_TLS_REJECT_UNAUTHORIZED="0", NODE_EXTRA_CA_CERTS="",
                               FORENA_PARTICIPATION_BACKEND="legacy", VERCEL_TOKEN="poison-deploy")
            environment.update(overrides)
            return subprocess.run(["sh", str(ROOT / script)], env=environment, text=True, capture_output=True)

    def test_frontend_gets_no_admin_database_or_deploy_credentials(self):
        result = self.run_entrypoint("deploy/frontend/entrypoint.sh")
        self.assertEqual(result.returncode, 0, result.stderr)
        args = json.loads(result.stdout)
        self.assertEqual(args[0], "-i")
        self.assertEqual(args[-2:], ["node", "server.js"])
        self.assertNotIn("poison", result.stdout)
        self.assertNotIn("synthetic-runtime", result.stdout)
        self.assertIn("FORENA_PARTICIPATION_BACKEND=kotlin", args)
        self.assertIn("NODE_USE_SYSTEM_CA=1", args)
        self.assertIn("NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt", args)
        self.assertFalse(any(value.startswith("NODE_TLS_REJECT_UNAUTHORIZED=") for value in args))

    def test_frontend_preserves_runtime_extra_ca_path(self):
        result = self.run_entrypoint("deploy/frontend/entrypoint.sh", NODE_EXTRA_CA_CERTS="/run/platform/ca.pem")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("NODE_EXTRA_CA_CERTS=/run/platform/ca.pem", json.loads(result.stdout))

    def test_frontend_requires_binding(self):
        result = self.run_entrypoint("deploy/frontend/entrypoint.sh", FORENA_KOTLIN_SERVICE_URL="")
        self.assertNotEqual(result.returncode, 0)

    def prepare(self, project_id="prj_V1a7hd39ABj3w5ARUOATF31XMWX9", root=None, auth=AUTH):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)
            (target / ".vercel").mkdir()
            (target / ".vercel/project.json").write_text(json.dumps({
                "projectId": project_id, "orgId": "team_hkR9c8WmDdaB7Ohge0pDlA6X",
                "settings": {"rootDirectory": root}}))
            env_file = target / ".vercel/.env.production.local"
            env_file.write_text(f'NEXT_PUBLIC_SUPABASE_URL="{auth}"\n'
                                'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_publishable_synthetic"\n'
                                'SITE_URL="https://forena-kotlin.vercel.app"\n'
                                'SUPABASE_SECRET_KEY="synthetic-admin"\n'
                                'FORENA_DB_PASSWORD="synthetic-runtime"\n')
            output = target / "github-env"
            result = subprocess.run(["node", str(ROOT / "scripts/deploy/prepare-kotlin.mjs")],
                                    cwd=target, env=dict(os.environ, GITHUB_ENV=str(output)),
                                    capture_output=True, text=True)
            return result, output.read_text() if output.exists() else "", env_file.read_text()

    def test_build_env_excludes_runtime_and_admin_credentials(self):
        result, github_env, build_env = self.prepare()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(AUTH, github_env)
        self.assertNotIn("synthetic-admin", build_env + github_env)
        self.assertNotIn("synthetic-runtime", build_env + github_env)

    def test_prepare_rejects_legacy_project_root_and_auth_before_export(self):
        for overrides in [{"project_id": "prj_KoyZzpTGHV3osX77YpL9ON7YMHd1"},
                          {"root": "backend"}, {"auth": "https://legacy.supabase.co"}]:
            result, github_env, _ = self.prepare(**overrides)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(github_env, "")


if __name__ == "__main__":
    unittest.main()
