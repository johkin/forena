"""Exercise independent cache invalidation against real tracked source trees."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from build_inputs import fingerprint


class BuildInputs(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        subprocess.run(['git', 'init', '--quiet'], cwd=self.root, check=True)
        self.files = {
            'backend/pom.xml': 'dependencies',
            'backend/src/main/kotlin/Activity.kt': 'backend',
            'backend/src/main/resources/db/010.sql': 'migration',
            'frontend/src/app.tsx': 'frontend',
            'src/components/header.tsx': 'shared',
            'package-lock.json': 'versions',
            'docs/architecture.md': 'documentation',
            'backend/README.md': 'documentation',
            '.github/workflows/ci.yml': 'toolchain',
            'scripts/deploy/build_inputs.py': 'key algorithm',
        }
        for name, content in self.files.items():
            self.write(name, content)
        subprocess.run(['git', 'add', '.'], cwd=self.root, check=True)

    def write(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)

    def key(self, component, **kwargs):
        return fingerprint(component, self.root, configuration=kwargs.get('configuration', {}),
                           node_version=kwargs.get('node_version', 'v24.19.0'))

    def test_frontend_change_keeps_backend_reusable(self):
        backend, frontend = self.key('backend'), self.key('frontend')
        self.write('frontend/src/app.tsx', 'new UI')
        self.assertEqual(backend, self.key('backend'))
        self.assertNotEqual(frontend, self.key('frontend'))

    def test_backend_and_migration_changes_keep_frontend_reusable(self):
        for name in ['backend/src/main/kotlin/Activity.kt', 'backend/pom.xml',
                     'backend/src/main/resources/db/010.sql']:
            with self.subTest(name=name):
                backend, frontend = self.key('backend'), self.key('frontend')
                self.write(name, 'changed')
                self.assertNotEqual(backend, self.key('backend'))
                self.assertEqual(frontend, self.key('frontend'))

    def test_shared_ui_and_dependency_changes_invalidate_frontend(self):
        for name in ['src/components/header.tsx', 'package-lock.json']:
            before = self.key('frontend')
            self.write(name, 'changed')
            self.assertNotEqual(before, self.key('frontend'))

    def test_public_configuration_and_node_version_are_part_of_frontend_key(self):
        before = self.key('frontend')
        for name in ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
                     'FORENA_KOTLIN_TEST_ACTIVITY_ID']:
            self.assertNotEqual(before, self.key('frontend', configuration={name: 'different'}))
        self.assertNotEqual(before, self.key('frontend', node_version='v25.0.0'))
        self.assertEqual(before, self.key('frontend', configuration={'FORENA_DB_PASSWORD': 'never-used'}))

    def test_documentation_and_generated_outputs_do_not_invalidate_builds(self):
        before = [self.key('backend'), self.key('frontend')]
        self.write('docs/architecture.md', 'updated')
        self.write('backend/README.md', 'updated')
        self.write('backend/target/binary', 'generated')
        self.write('frontend/dist/index.html', 'generated')
        self.assertEqual(before, [self.key('backend'), self.key('frontend')])

    def test_new_and_removed_tracked_files_and_permissions_change_key(self):
        before = self.key('backend')
        self.write('backend/src/main/kotlin/Person.kt', 'new source')
        subprocess.run(['git', 'add', '.'], cwd=self.root, check=True)
        added = self.key('backend')
        self.assertNotEqual(before, added)
        os.chmod(self.root / 'backend/pom.xml', 0o755)
        self.assertNotEqual(added, self.key('backend'))
        subprocess.run(['git', 'rm', '--quiet', '--force', 'backend/src/main/kotlin/Person.kt'],
                       cwd=self.root, check=True)
        os.chmod(self.root / 'backend/pom.xml', 0o644)
        self.assertEqual(before, self.key('backend'))

    def test_markdown_runtime_resources_are_still_build_inputs(self):
        self.write('backend/src/main/resources/template.md', 'runtime template')
        subprocess.run(['git', 'add', '.'], cwd=self.root, check=True)
        before = self.key('backend')
        self.write('backend/src/main/resources/template.md', 'updated template')
        self.assertNotEqual(before, self.key('backend'))

    def test_build_tooling_changes_invalidate_both_components(self):
        for name in ['.github/workflows/ci.yml', 'scripts/deploy/build_inputs.py']:
            before = [self.key('backend'), self.key('frontend')]
            self.write(name, 'changed')
            self.assertTrue(all(old != new for old, new in zip(
                before, [self.key('backend'), self.key('frontend')])))
