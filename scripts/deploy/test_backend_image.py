"""A release must keep the tested image and use a digest in the correct repository."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('backend_image', Path(__file__).with_name('use-backend-image.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BackendImage(unittest.TestCase):
    def setUp(self):
        self.commit = 'a' * 40
        self.image = {'Id': 'sha256:' + 'b' * 64, 'Os': 'linux', 'Architecture': 'amd64',
                      'RepoDigests': [module.REPOSITORY + '@sha256:' + 'c' * 64]}
        self.metadata = {'sourceCommit': self.commit, 'verifiedCommit': self.commit,
                         'buildInputs': module.fingerprint('backend'), 'imageId': self.image['Id']}
        self.public_key = 'sb_publishable_synthetic'

    def test_selects_digest_without_changing_image(self):
        module.verify_image(self.image, self.metadata, self.commit)
        result = module.configure(self.image, self.public_key, "public-ca")
        self.assertEqual(result['handler'], self.image['RepoDigests'][0])

    def test_rejects_wrong_commit_or_image(self):
        for metadata in [dict(self.metadata, verifiedCommit='d' * 40), dict(self.metadata, imageId='sha256:' + 'e' * 64)]:
            with self.assertRaises(ValueError):
                module.verify_image(self.image, metadata, self.commit)

    def test_accepts_reuse_only_with_current_verification_and_identical_inputs(self):
        reused = dict(self.metadata, sourceCommit='d' * 40)
        module.verify_image(self.image, reused, self.commit)
        for invalid in [dict(reused, buildInputs='e' * 64),
                        dict(reused, verifiedCommit='d' * 40),
                        dict(reused, sourceCommit=''),
                        {'sourceCommit': self.commit, 'imageId': self.image['Id']}]:
            with self.assertRaises(ValueError):
                module.verify_image(self.image, invalid, self.commit)

    def test_record_preserves_original_build_commit_after_retesting(self):
        original = module.record_image(self.image, self.commit)
        current = 'd' * 40
        reused = module.record_image(self.image, current, original)
        self.assertEqual(reused['sourceCommit'], self.commit)
        self.assertEqual(reused['verifiedCommit'], current)
        module.verify_image(self.image, reused, current)
        with self.assertRaises(ValueError):
            module.record_image(dict(self.image, Id='sha256:' + 'e' * 64), current, original)
        with self.assertRaises(ValueError):
            module.record_image(self.image, current, dict(original, buildInputs='f' * 64))

    def test_rejects_wrong_platform(self):
        with self.assertRaises(ValueError):
            module.verify_image(dict(self.image, Architecture='arm64'), self.metadata, self.commit)

    def test_rejects_mutable_wrong_or_ambiguous_registry_reference(self):
        for refs in [[], [module.REPOSITORY + ':latest'], ['other.example/backend@sha256:' + 'c' * 64],
                     self.image['RepoDigests'] * 2]:
            with self.assertRaises(ValueError):
                module.configure(dict(self.image, RepoDigests=refs), self.public_key, "public-ca")

    def test_api_route_keeps_path_and_precedes_spa_fallback(self):
        import re
        route = module.routes()[1]
        for path in ['/api/activities', '/api', '/actuator/health', '/oauth2/authorize', '/oauth2/token', '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource/api/mcp']:
            match = re.fullmatch(route['src'], path)
            self.assertIsNotNone(match)
            self.assertEqual('/' + match.group(1), path)
        self.assertEqual(route['transforms'][0]['args'], '/$1')
        self.assertEqual(module.routes()[-1]['dest'], '/index.html')

    def test_output_contains_only_registry_reference_and_static_frontend(self):
        import os
        import json
        import tempfile
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory:
            original = Path.cwd()
            try:
                os.chdir(directory)
                Path('frontend/dist').mkdir(parents=True)
                Path('frontend/dist/index.html').write_text('frontend')
                Path('backend/certs').mkdir(parents=True)
                Path('backend/certs/supabase-ca.crt').write_text('public-ca')
                with patch.dict(os.environ, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=self.public_key):
                    module.write_output(self.image)
                output = Path('.vercel/output')
                descriptor = json.loads((output / 'functions/backend.func/.vc-config.json').read_text())
                self.assertEqual(descriptor['handler'], self.image['RepoDigests'][0])
                self.assertNotIn('command', descriptor)
                self.assertEqual(descriptor['environment']['FORENA_MIGRATE'], 'true')
                self.assertEqual(list((output / 'functions/backend.func').iterdir()),
                                 [output / 'functions/backend.func/.vc-config.json'])
                self.assertEqual((output / 'static/index.html').read_text(), 'frontend')
            finally:
                os.chdir(original)
