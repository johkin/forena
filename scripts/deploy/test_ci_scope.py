"""Skip only unaffected checks, keeping complete current-release verification."""
import itertools
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest
from ci_scope import COMPONENTS, changed_paths, select_scope, verify_results


class CiScope(unittest.TestCase):
    def test_frontend_pr_does_not_build_backend_or_database(self):
        self.assertEqual(select_scope('pull_request', [
            'frontend/src/app.tsx', 'src/components/session-menu.tsx',
            'package-lock.json', 'docs/design-spec.md']),
            dict(application=True, database=False, backend=False, native=False))

    def test_backend_code_tests_migrations_and_build_inputs_require_backend(self):
        for path in ['backend/src/main/kotlin/Activity.kt',
                     'backend/src/test/kotlin/ApiTest.kt',
                     'backend/src/main/resources/db/010.sql', 'backend/pom.xml',
                     'deploy/backend/entrypoint.sh', 'scripts/deploy/build_inputs.py',
                     'scripts/deploy/use-backend-image.py', '.gitattributes', 'pom.xml',
                     '.github/workflows/ci.yml', 'scripts/deploy/ci_scope.py',
                     'scripts/deploy/test_ci_scope.py',
                     'scripts/migration/activity-management-browser.mjs',
                     'scripts/migration/auth-browser.mjs']:
            with self.subTest(path=path):
                self.assertTrue(select_scope('pull_request', [path])['backend'])

    def test_database_and_shared_contract_changes_select_their_dependents(self):
        self.assertEqual(select_scope('pull_request', ['supabase/migrations/010.sql']),
                         dict(application=True, database=True, backend=False, native=False))
        self.assertEqual(select_scope('pull_request', ['backend/contract/generated.ts']),
                         dict(application=True, database=False, backend=True, native=True))
        self.assertEqual(select_scope('pull_request', ['supabase/functions/worker/index.ts']),
                         dict(application=True, database=False, backend=False, native=False))

    def test_mixed_changes_combine_checks_independent_of_order(self):
        paths = ['backend/src/main/kotlin/Activity.kt', 'src/components/header.tsx',
                 'supabase/migrations/010.sql']
        for order in itertools.permutations(paths):
            self.assertTrue(all(select_scope('pull_request', order).values()))

    def test_documentation_and_unknown_build_inputs(self):
        self.assertFalse(any(select_scope('pull_request', [
            'backend/README.md', 'backend/docs/architecture.md', 'docs/design-spec.md']).values()))
        self.assertTrue(all(select_scope('pull_request', ['new-toolchain.conf']).values()))

    def test_main_reuses_identical_backend_but_verifies_current_frontend(self):
        self.assertEqual(select_scope('push', ['frontend/src/app.tsx'], backend_cache_hit=True),
                         dict(application=True, database=False, backend=False, native=True))
        self.assertEqual(select_scope('push', ['docs/design-spec.md'], backend_cache_hit=True),
                         dict(application=False, database=False, backend=False, native=True))

    def test_missing_or_expired_backend_cache_requires_a_build(self):
        self.assertEqual(select_scope('push', ['frontend/src/app.tsx']),
                         dict(application=True, database=False, backend=True, native=True))
        self.assertTrue(select_scope('push', [], backend_cache_hit=False)['backend'])

    def test_changed_backend_and_browser_tests_are_verified_even_with_a_cache(self):
        for path in ['backend/src/main/kotlin/Activity.kt',
                     'scripts/migration/activity-management-browser.mjs']:
            self.assertTrue(select_scope('push', [path], backend_cache_hit=True)['backend'])

    def test_unknown_baseline_manual_and_unknown_events_require_every_check(self):
        for event, paths in [('push', None), ('pull_request', None),
                             ('workflow_dispatch', []), ('unknown', [])]:
            self.assertTrue(all(select_scope(event, paths, backend_cache_hit=True).values()))

    def test_workflow_baseline_lookup_handles_api_failure_under_strict_bash(self):
        root = Path(__file__).resolve().parents[2]
        workflow = (root / '.github/workflows/ci.yml').read_text()
        step = workflow.split('      - name: Compare main with its last successful verification\n', 1)[1]
        step = step.split('\n      - name:', 1)[0]
        script = textwrap.dedent(step.split('        run: |\n', 1)[1])
        commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
        with tempfile.TemporaryDirectory() as directory:
            temporary = Path(directory)
            gh = temporary / 'gh'
            gh.write_text('#!/bin/sh\nprintf "%s\\n" "$LOOKUP_OUTPUT"\nexit "$LOOKUP_STATUS"\n')
            gh.chmod(0o755)
            github_env = temporary / 'github-env'
            for status, output, expected in [(0, commit, commit), (0, '', ''),
                                             (1, '', ''), (1, commit, '')]:
                with self.subTest(status=status, output=output):
                    github_env.write_text('')
                    result = subprocess.run(['bash', '-euo', 'pipefail', '-c', script],
                        env={**os.environ, 'PATH': directory + os.pathsep + os.environ['PATH'],
                             'GITHUB_REPOSITORY': 'example/repository', 'GITHUB_ENV': str(github_env),
                             'LOOKUP_OUTPUT': output, 'LOOKUP_STATUS': str(status)},
                        capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertEqual(github_env.read_text(), f'MAIN_BASE_SHA={expected}\n')
                    if not expected:
                        self.assertTrue(all(select_scope('push', changed_paths(expected, root),
                                                         backend_cache_hit=True).values()))

    def test_changes_since_successful_baseline_include_intermediate_failed_commits(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(['git', 'init', '--quiet'], cwd=root, check=True)
            def commit(name):
                (root / name).parent.mkdir(parents=True, exist_ok=True)
                (root / name).write_text(name)
                subprocess.run(['git', 'add', '.'], cwd=root, check=True)
                subprocess.run(['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
                                'commit', '--quiet', '-m', name], cwd=root, check=True)
                return subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
            baseline = commit('README.md')
            intermediate = commit('supabase/migrations/change.sql')  # An intervening unsuccessful build.
            commit('frontend/src/app.tsx')
            paths = changed_paths(baseline, root)
            scope = select_scope('push', paths, backend_cache_hit=True)
            self.assertTrue(scope['database'])
            self.assertTrue(scope['application'])
            self.assertFalse(scope['backend'])
            self.assertIsNone(changed_paths('', root))
            self.assertIsNone(changed_paths('0' * 40, root))
            subprocess.run(['git', 'checkout', '--quiet', baseline], cwd=root, check=True)
            self.assertIsNone(changed_paths(intermediate, root))

    def test_valid_combinations_and_all_unexpected_results(self):
        for flags in itertools.product(['true', 'false'], repeat=len(COMPONENTS)):
            required = dict(zip(COMPONENTS, flags))
            valid = {('native-image' if name == 'native' else name):
                     'success' if required[name] == 'true' else 'skipped' for name in COMPONENTS}
            if required['backend'] == 'true' and required['native'] != 'true':
                with self.assertRaises(ValueError):
                    verify_results(required, 'success', valid)
                continue
            verify_results(required, 'success', valid)
            for job in valid:
                for state in ['', 'failure', 'cancelled', 'skipped', 'success']:
                    if state != valid[job]:
                        with self.subTest(flags=flags, job=job, state=state):
                            with self.assertRaises(ValueError):
                                verify_results(required, 'success', {**valid, job: state})
            for state in ['', 'failure', 'cancelled', 'skipped']:
                with self.assertRaises(ValueError):
                    verify_results(required, state, valid)
        for required in [{}, dict.fromkeys(COMPONENTS, ''), dict.fromkeys(COMPONENTS, 'unknown')]:
            with self.assertRaises(ValueError):
                verify_results(required, 'success', valid)
