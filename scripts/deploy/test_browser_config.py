"""Public frontend configuration must never serialize the build environment."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class BrowserConfig(unittest.TestCase):
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
