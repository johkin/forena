"""Native release selection must reject Java launch commands and wrappers."""
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('extract_native', Path(__file__).with_name('extract-native.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class NativeSelection(unittest.TestCase):
    def config(self, processes):
        return {'Labels': {'io.buildpacks.build.metadata': json.dumps({'processes': processes})}}

    def test_accepts_buildpack_native_process(self):
        for command in ['/workspace/forena-api', ['/layers/native/forena-api']]:
            self.assertEqual(module.web_command(self.config([
                {'type': 'web', 'command': command, 'args': []}])),
                command[0] if isinstance(command, list) else command)

    def test_resolves_actual_paketo_relative_command(self):
        config = self.config([{'type': 'web', 'command': './se.forena.api.ForenaApplicationKt',
                               'args': [], 'direct': True}])
        config['WorkingDir'] = '/workspace'
        self.assertEqual(module.web_command(config), '/workspace/se.forena.api.ForenaApplicationKt')

    def test_rejects_relative_command_escaping_workspace(self):
        config = self.config([{'type': 'web', 'command': '../bin/java'}])
        config['WorkingDir'] = '/workspace'
        with self.assertRaises(ValueError):
            module.web_command(config)

    def test_rejects_jvm_or_ambiguous_process(self):
        for processes in [[], [{'type': 'web', 'command': 'java', 'args': ['-jar', 'app.jar']}],
                          [{'type': 'web', 'command': ['/workspace/app', 'extra']}],
                          [{'type': 'web', 'command': '/workspace/wrapper', 'args': ['app.jar']}],
                          [{'type': 'web', 'command': '/workspace/app'}] * 2]:
            with self.assertRaises(ValueError):
                module.web_command(self.config(processes))
