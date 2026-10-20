"""Public frontend configuration must never serialize the build environment."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class BrowserConfig(unittest.TestCase):
    def prepare_release(self, directory, session_key):
        root = Path(directory)
        (root / ".vercel").mkdir()
        (root / ".vercel/project.json").write_text(json.dumps({
            "projectId": "prj_V1a7hd39ABj3w5ARUOATF31XMWX9", "orgId": "team_hkR9c8WmDdaB7Ohge0pDlA6X"}))
        values = {"NEXT_PUBLIC_SUPABASE_URL": "https://ckzrtxqjskosqzoitymc.supabase.co",
                  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": "sb_publishable_synthetic",
                  "SITE_URL": "https://forena-kotlin.vercel.app", "FORENA_DB_PASSWORD": "poison-database-secret"}
        if session_key is not None:
            values["FORENA_WEB_SESSION_KEY"] = session_key
        (root / ".vercel/.env.production.local").write_text("\n".join(f"{k}={json.dumps(v)}" for k, v in values.items()))
        return subprocess.run(["node", str(ROOT / "scripts/deploy/prepare-kotlin.mjs")], cwd=directory,
                              env=dict(os.environ, GITHUB_ENV=str(root / "github-env")), capture_output=True, text=True)

    def test_release_accepts_secret_placeholder_without_exporting_it(self):
        for key in ["[SENSITIVE]", "A" * 43 + "="]:
            with self.subTest(key=key), tempfile.TemporaryDirectory() as directory:
                result = self.prepare_release(directory, key)
                self.assertEqual(result.returncode, 0, result.stderr)
                build = (Path(directory) / ".vercel/.env.production.local").read_text()
                exported = (Path(directory) / "github-env").read_text()
                for output in [build, exported, result.stdout, result.stderr]:
                    self.assertNotIn(key, output)
                    self.assertNotIn("FORENA_WEB_SESSION_KEY", output)
                    self.assertNotIn("poison-database-secret", output)
                self.assertIn("NEXT_PUBLIC_SUPABASE_URL", exported)

    def test_release_rejects_missing_or_malformed_readable_key(self):
        for key in [None, "", "[SENSITIVE]-wrong", "malformed-private-value"]:
            with self.subTest(key=key), tempfile.TemporaryDirectory() as directory:
                result = self.prepare_release(directory, key)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("Configure FORENA_WEB_SESSION_KEY", result.stderr)
                self.assertFalse((Path(directory) / "github-env").exists())
                if key:
                    self.assertNotIn(key, result.stdout + result.stderr)

    def test_build_emits_only_public_target_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run(["node", str(ROOT / "frontend/scripts/public-config.mjs")], cwd=directory,
                                    env=dict(os.environ, NEXT_PUBLIC_SUPABASE_URL="https://ckzrtxqjskosqzoitymc.supabase.co",
                                             NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_publishable_synthetic",
                                             FORENA_DB_PASSWORD="poison-password", SUPABASE_SECRET_KEY="poison-admin",
                                             FORENA_KOTLIN_TEST_ACTIVITY_ID=""), capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            config = json.loads((Path(directory) / "public/config.json").read_text())
            self.assertEqual(set(config), {"supabaseUrl", "publishableKey", "version"})
            self.assertNotIn("poison", json.dumps(config))
            version = json.loads((Path(directory) / "public/app-version.json").read_text())
            self.assertEqual(config["version"], version["version"])
