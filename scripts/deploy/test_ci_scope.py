"""Only explicitly irrelevant PR jobs may skip; releases retain every check."""
import itertools
import unittest
from ci_scope import COMPONENTS, select_scope, verify_results


class CiScope(unittest.TestCase):
    def test_frontend_pr_does_not_build_backend_or_database(self):
        self.assertEqual(select_scope('pull_request', [
            'frontend/src/app.tsx', 'src/components/session-menu.tsx',
            'scripts/migration/activity-management-browser.mjs', 'package-lock.json',
            'docs/design-spec.md', '.github/workflows/ci.yml', 'scripts/deploy/ci_scope.py']),
            dict(application=True, database=False, backend=False))

    def test_backend_code_tests_migrations_and_build_inputs_require_backend(self):
        for path in ['backend/src/main/kotlin/Activity.kt',
                     'backend/src/test/kotlin/ApiTest.kt',
                     'backend/src/main/resources/db/010.sql', 'backend/pom.xml',
                     'deploy/backend/entrypoint.sh', 'scripts/deploy/build_inputs.py',
                     'scripts/deploy/use-backend-image.py', '.gitattributes', 'pom.xml']:
            with self.subTest(path=path):
                self.assertTrue(select_scope('pull_request', [path])['backend'])

    def test_database_and_shared_contract_changes_select_their_dependents(self):
        self.assertEqual(select_scope('pull_request', ['supabase/migrations/010.sql']),
                         dict(application=True, database=True, backend=False))
        self.assertEqual(select_scope('pull_request', ['backend/contract/generated.ts']),
                         dict(application=True, database=False, backend=True))
        self.assertEqual(select_scope('pull_request', ['supabase/functions/worker/index.ts']),
                         dict(application=True, database=False, backend=False))

    def test_mixed_changes_combine_checks_independent_of_order(self):
        paths = ['backend/src/main/kotlin/Activity.kt', 'src/components/header.tsx',
                 'supabase/migrations/010.sql']
        for order in itertools.permutations(paths):
            self.assertTrue(all(select_scope('pull_request', order).values()))

    def test_documentation_and_unknown_build_inputs(self):
        self.assertFalse(any(select_scope('pull_request', [
            'backend/README.md', 'backend/docs/architecture.md', 'docs/design-spec.md']).values()))
        self.assertTrue(all(select_scope('pull_request', ['new-toolchain.conf']).values()))

    def test_main_and_manual_runs_always_produce_release_artifacts(self):
        for event in ['push', 'workflow_dispatch']:
            for paths in [[], ['frontend/src/app.tsx']]:
                self.assertTrue(all(select_scope(event, paths).values()))

    def test_valid_combinations_and_all_unexpected_results(self):
        for flags in itertools.product(['true', 'false'], repeat=3):
            required = dict(zip(COMPONENTS, flags))
            valid = {name: 'success' if required[name] == 'true' else 'skipped' for name in COMPONENTS}
            valid['native-image'] = valid['backend']
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
