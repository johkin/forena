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
        self.metadata = {'sourceCommit': self.commit, 'imageId': self.image['Id']}
        self.config = {'services': {'backend': {'root': 'deploy/backend-image', 'runtime': 'container'}}}

    def test_selects_digest_without_changing_image(self):
        module.verify_image(self.image, self.metadata, self.commit)
        result = module.configure(self.config, self.image)
        self.assertEqual(result['services']['backend']['entrypoint'], self.image['RepoDigests'][0])

    def test_rejects_wrong_commit_or_image(self):
        for metadata in [dict(self.metadata, sourceCommit='d' * 40), dict(self.metadata, imageId='sha256:' + 'e' * 64)]:
            with self.assertRaises(ValueError):
                module.verify_image(self.image, metadata, self.commit)

    def test_rejects_wrong_platform(self):
        with self.assertRaises(ValueError):
            module.verify_image(dict(self.image, Architecture='arm64'), self.metadata, self.commit)

    def test_rejects_mutable_wrong_or_ambiguous_registry_reference(self):
        for refs in [[], [module.REPOSITORY + ':latest'], ['other.example/backend@sha256:' + 'c' * 64],
                     self.image['RepoDigests'] * 2]:
            with self.assertRaises(ValueError):
                module.configure(self.config, dict(self.image, RepoDigests=refs))

    def test_rejects_dockerfile_service_root(self):
        self.config['services']['backend']['root'] = 'backend/api'
        with self.assertRaises(ValueError):
            module.configure(self.config, self.image)
