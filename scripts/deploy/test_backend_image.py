"""A release must keep the tested image and use a digest in the correct repository."""
import importlib.util
from pathlib import Path
import unittest
import hashlib
import tempfile
import json
import subprocess
import sys
import io
import tarfile
import shutil

spec = importlib.util.spec_from_file_location('backend_image', Path(__file__).with_name('use-backend-image.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BackendImage(unittest.TestCase):
    def setUp(self):
        self.commit = 'a' * 40
        self.image = {'Id': 'sha256:' + 'b' * 64, 'Os': 'linux', 'Architecture': 'amd64',
                      'RepoDigests': [module.REPOSITORY + '@sha256:' + 'c' * 64]}
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.archive = Path(self.directory.name) / 'forena-backend.tar.gz'
        self.raw_config = json.dumps({'architecture': 'amd64', 'os': 'linux',
                                     'config': {'Entrypoint': ['/cnb/process/web']},
                                     'rootfs': {'type': 'layers', 'diff_ids': ['sha256:' + 'd' * 64]}},
                                    indent=2).encode() + b'\n'
        self.write_archive(self.archive)
        self.config_digest = 'sha256:' + hashlib.sha256(self.raw_config).hexdigest()
        self.metadata = {'sourceCommit': self.commit, 'verifiedCommit': self.commit,
                         'buildInputs': module.fingerprint('backend'), 'imageId': self.image['Id'],
                         'configDigest': self.config_digest}
        self.manifest = {'schemaVersion': 2, 'mediaType': 'application/vnd.docker.distribution.manifest.v2+json',
                         'config': {'mediaType': 'application/vnd.docker.container.image.v1+json',
                                    'digest': self.config_digest, 'size': len(self.raw_config)},
                         'layers': [{'mediaType': 'application/vnd.docker.image.rootfs.diff.tar.gzip',
                                     'digest': 'sha256:' + 'e' * 64, 'size': 100}]}
        self.raw_manifest = json.dumps(self.manifest, separators=(',', ':')).encode()
        self.published_ref = module.REPOSITORY + '@sha256:' + hashlib.sha256(self.raw_manifest).hexdigest()
        self.public_key = 'sb_publishable_synthetic'

    def write_archive(self, path, config=None, manifest=None, config_path='config.json'):
        values = {'manifest.json': json.dumps(manifest if manifest is not None else [
            {'Config': config_path, 'RepoTags': ['forena-backend:ci'], 'Layers': ['layer.tar']}]).encode(),
            config_path: self.raw_config if config is None else config, 'layer.tar': b'fixture layer'}
        with tarfile.open(path, 'w:gz') as archive:
            for name, content in values.items():
                member = tarfile.TarInfo(name)
                member.size = len(content)
                archive.addfile(member, io.BytesIO(content))

    def test_selects_digest_without_changing_image(self):
        module.verify_image(self.image, self.metadata, self.commit)
        result = module.configure(self.raw_manifest, self.metadata, self.commit, "public-ca")
        self.assertEqual(result['handler'], self.published_ref)
        self.assertNotEqual(self.metadata['imageId'], self.config_digest)

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
        original = module.record_image(self.image, self.commit, self.archive)
        current = 'd' * 40
        reused = module.record_image(self.image, current, self.archive, original)
        self.assertEqual(reused['sourceCommit'], self.commit)
        self.assertEqual(reused['verifiedCommit'], current)
        module.verify_image(self.image, reused, current)
        with self.assertRaises(ValueError):
            module.record_image(dict(self.image, Id='sha256:' + 'e' * 64), current, self.archive, original)
        with self.assertRaises(ValueError):
            module.record_image(self.image, current, self.archive, dict(original, buildInputs='f' * 64))

    def test_rejects_wrong_platform(self):
        with self.assertRaises(ValueError):
            module.verify_image(dict(self.image, Architecture='arm64'), self.metadata, self.commit)

    def test_cached_migration_jar_must_match_the_verified_bundle(self):
        with tempfile.TemporaryDirectory() as directory:
            jar = Path(directory) / 'forena-api.jar'
            jar.write_bytes(b'verified migration jar')
            metadata = dict(self.metadata, migrationJarSha256=hashlib.sha256(jar.read_bytes()).hexdigest())
            module.verify_migration_jar(metadata, jar)
            with self.assertRaises(ValueError):
                module.verify_migration_jar(self.metadata, jar)
            jar.write_bytes(b'another jar')
            with self.assertRaises(ValueError):
                module.verify_migration_jar(metadata, jar)

    def test_bundle_commands_record_verify_and_reject_a_changed_jar(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            metadata = root / 'backend-image.json'
            inspect = root / 'inspect.json'
            jar = root / 'forena-api.jar'
            shutil.copyfile(self.archive, root / 'forena-backend.tar.gz')
            inspect.write_text(json.dumps([self.image]))
            jar.write_bytes(b'verified migration jar')
            command = [sys.executable, str(Path(module.__file__).resolve())]
            subprocess.run([*command, 'record', str(metadata), str(inspect), self.commit], check=True)
            self.assertEqual(json.loads(metadata.read_text())['configDigest'], self.config_digest)
            subprocess.run([*command, 'verify-cache', str(metadata), str(inspect), self.commit], check=True)
            self.assertEqual(json.loads(metadata.read_text())['migrationJarSha256'],
                             hashlib.sha256(jar.read_bytes()).hexdigest())
            jar.write_bytes(b'another jar')
            rejected = subprocess.run([*command, 'verify-cache', str(metadata), str(inspect), self.commit],
                                      capture_output=True, text=True)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn('Migration JAR differs', rejected.stderr)
            jar.write_bytes(b'verified migration jar')
            changed = json.loads(self.raw_config)
            changed['config']['Entrypoint'] = ['/changed/program']
            self.write_archive(root / 'forena-backend.tar.gz', config=json.dumps(changed).encode())
            rejected = subprocess.run([*command, 'verify-cache', str(metadata), str(inspect), self.commit],
                                      capture_output=True, text=True)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn('Image archive config differs', rejected.stderr)

    def test_archive_digest_uses_raw_config_bytes_and_containerd_config_path(self):
        self.write_archive(self.archive, config_path='blobs/sha256/config')
        self.assertEqual(module.archive_config_digest(self.archive), self.config_digest)
        self.assertNotEqual(self.config_digest, 'sha256:' + hashlib.sha256(
            json.dumps(json.loads(self.raw_config)).encode()).hexdigest())

    def test_archive_requires_one_image_and_expected_platform(self):
        for manifest in [[], [{'Config': 'config.json'}, {'Config': 'config.json'}], [{}],
                         [{'Config': 'missing.json'}]]:
            with self.subTest(manifest=manifest), self.assertRaises(ValueError):
                self.write_archive(self.archive, manifest=manifest)
                module.archive_config_digest(self.archive)
        for os_name, architecture in [('windows', 'amd64'), ('linux', 'arm64')]:
            with self.subTest(os=os_name, arch=architecture), self.assertRaises(ValueError):
                self.write_archive(self.archive, config=json.dumps({'os': os_name, 'architecture': architecture}).encode())
                module.archive_config_digest(self.archive)

    def test_archive_tamper_is_rejected_even_when_image_id_is_unchanged(self):
        changed = json.loads(self.raw_config)
        changed['config']['Entrypoint'] = ['/another/program']
        self.write_archive(self.archive, config=json.dumps(changed).encode())
        with self.assertRaises(ValueError):
            module.verify_archive(self.metadata, self.archive)
        with self.assertRaises(ValueError):
            module.record_image(self.image, 'd' * 40, self.archive, self.metadata)

    def test_published_manifest_rejects_changed_config_uncompressed_layers_and_indexes(self):
        variants = []
        changed = json.loads(self.raw_manifest)
        changed['config']['digest'] = 'sha256:' + 'f' * 64
        variants.append(changed)
        for media_type in ['application/vnd.docker.image.rootfs.diff.tar',
                           'application/vnd.oci.image.layer.v1.tar',
                           'application/vnd.oci.image.layer.v1.tar+zstd']:
            changed = json.loads(self.raw_manifest)
            changed['layers'][0]['mediaType'] = media_type
            variants.append(changed)
        variants.append({'schemaVersion': 2, 'mediaType': 'application/vnd.oci.image.index.v1+json',
                         'manifests': []})
        for manifest in variants:
            with self.subTest(manifest=manifest), self.assertRaises(ValueError):
                module.configure(json.dumps(manifest).encode(), self.metadata, self.commit, '')

    def test_published_manifest_still_requires_verified_commit_inputs_and_config_digest(self):
        for metadata, commit in [(self.metadata, 'd' * 40),
                                 (dict(self.metadata, buildInputs='f' * 64), self.commit),
                                 (dict(self.metadata, configDigest=''), self.commit)]:
            with self.subTest(metadata=metadata, commit=commit), self.assertRaises(ValueError):
                module.configure(self.raw_manifest, metadata, commit, '')

    def test_gzip_representation_can_change_manifest_digest_while_preserving_config(self):
        raw_with_newline = self.raw_manifest + b'\n'
        self.assertEqual(module.configure(raw_with_newline, self.metadata, self.commit, '')['handler'],
                         module.REPOSITORY + '@sha256:' + hashlib.sha256(raw_with_newline).hexdigest())
        changed = json.loads(self.raw_manifest)
        changed['mediaType'] = 'application/vnd.oci.image.manifest.v1+json'
        changed['config']['mediaType'] = 'application/vnd.oci.image.config.v1+json'
        changed['layers'][0]['mediaType'] = 'application/vnd.oci.image.layer.v1.tar+gzip'
        changed['layers'][0]['digest'] = 'sha256:' + 'f' * 64
        raw = json.dumps(changed, indent=2).encode()
        result = module.configure(raw, self.metadata, self.commit, '')
        self.assertEqual(result['handler'], module.REPOSITORY + '@sha256:' + hashlib.sha256(raw).hexdigest())
        self.assertNotEqual(result['handler'], self.published_ref)

    def test_bundle_commands_configure_and_verify_the_remote_manifest_and_reject_output_tamper(self):
        command = [sys.executable, str(Path(module.__file__).resolve())]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(['git', 'init', '--quiet', str(root)], check=True)
            metadata = root / 'backend-image.json'
            manifest = root / 'backend-published-manifest.json'
            metadata.write_text(json.dumps(dict(self.metadata, buildInputs=module.fingerprint('backend', root))))
            manifest.write_bytes(self.raw_manifest)
            (root / 'frontend/dist').mkdir(parents=True)
            (root / 'frontend/dist/index.html').write_text('frontend')
            (root / 'backend/certs').mkdir(parents=True)
            (root / 'backend/certs/supabase-ca.crt').write_text('public-ca')
            subprocess.run([*command, 'configure', str(metadata), str(manifest), self.commit], cwd=root, check=True)
            subprocess.run([*command, 'verify-output', str(metadata), str(manifest), self.commit], cwd=root, check=True)
            descriptor_path = root / '.vercel/output/functions/backend.func/.vc-config.json'
            descriptor = json.loads(descriptor_path.read_text())
            for change in [{'handler': module.REPOSITORY + ':latest'},
                           {'handler': 'other.example/backend@sha256:' + 'f' * 64},
                           {'handler': module.REPOSITORY + '@sha256:' + 'f' * 64},
                           {'architecture': 'arm64'}, {'runtime': 'nodejs'}, {'command': ['/another/program']}]:
                descriptor_path.write_text(json.dumps(dict(descriptor, **change)))
                rejected = subprocess.run([*command, 'verify-output', str(metadata), str(manifest), self.commit],
                                          cwd=root, capture_output=True, text=True)
                self.assertNotEqual(rejected.returncode, 0, change)

    def test_api_route_keeps_path_and_precedes_spa_fallback(self):
        import re
        route = module.routes()[1]
        for path in ['/internal/notifications/run', '/internal/notifications/status', '/api/activities', '/api', '/actuator/health', '/oauth2/authorize', '/oauth2/token', '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource/api/mcp']:
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
                with patch.dict(os.environ, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=self.public_key), \
                        patch.object(module, 'fingerprint', return_value=self.metadata['buildInputs']):
                    module.write_output(self.raw_manifest, self.metadata, self.commit)
                output = Path('.vercel/output')
                descriptor = json.loads((output / 'functions/backend.func/.vc-config.json').read_text())
                self.assertEqual(descriptor['handler'], self.published_ref)
                self.assertNotIn('command', descriptor)
                self.assertEqual(descriptor['environment']['FORENA_MIGRATE'], 'true')
                self.assertEqual(list((output / 'functions/backend.func').iterdir()),
                                 [output / 'functions/backend.func/.vc-config.json'])
                self.assertEqual((output / 'static/index.html').read_text(), 'frontend')
            finally:
                os.chdir(original)
