"""Select relevant PR checks; main always produces all verified release artifacts."""
import os
from pathlib import PurePosixPath
import subprocess
import sys

COMPONENTS = ('application', 'database', 'backend')


def select_scope(event, paths):
    if event != 'pull_request':
        return dict.fromkeys(COMPONENTS, True)
    scope = dict.fromkeys(COMPONENTS, False)
    for path in paths:
        if not path or path in {'README.md', 'AGENTS.md', 'DESIGN.md', 'LICENSE',
                                'backend/README.md', 'frontend/README.md'} or path.startswith(
                ('docs/', 'backend/docs/', 'frontend/docs/')):
            continue
        if path.startswith(('backend/', 'deploy/backend/')) or PurePosixPath(path).name in {
                'pom.xml', 'mvnw', 'mvnw.cmd'}:
            scope['backend'] = True
            if path.startswith('backend/contract/'):
                scope['application'] = True
        elif path.startswith('supabase/'):
            scope['application'] = True
            if not path.startswith('supabase/functions/'):
                scope['database'] = True
        elif path in {'scripts/deploy/build_inputs.py', 'scripts/deploy/use-backend-image.py'}:
            scope['application'] = scope['backend'] = True
        elif path.startswith(('frontend/', 'src/', 'public/', 'scripts/', 'deploy/frontend/')) or path in {
                'package.json', 'package-lock.json', 'tsconfig.json', '.npmrc',
                'next.config.ts', 'next-env.d.ts', 'eslint.config.mjs',
                '.github/workflows/ci.yml', '.github/workflows/deploy-kotlin.yml',
                'deploy/vercel.kotlin.json', 'vercel.json'} or path.startswith('vitest.config.'):
            scope['application'] = True
        else:
            # Unknown build inputs must not silently lose verification.
            return dict.fromkeys(COMPONENTS, True)
    return scope


def verify_results(required, scope_result, results):
    if scope_result != 'success' or set(required) != set(COMPONENTS):
        raise ValueError('CI scope did not finish successfully')
    for component, value in required.items():
        if value not in {'true', 'false'}:
            raise ValueError('Missing or invalid CI scope')
        expected = 'success' if value == 'true' else 'skipped'
        jobs = ('backend', 'native-image') if component == 'backend' else (component,)
        if any(results.get(job) != expected for job in jobs):
            raise ValueError('Required CI jobs did not finish successfully')


if __name__ == '__main__':
    if sys.argv[1:] == ['verify']:
        verify_results(
            {name: os.environ.get(name.upper() + '_REQUIRED', '') for name in COMPONENTS},
            os.environ.get('SCOPE_RESULT', ''),
            {name: os.environ.get(variable, '') for name, variable in (
                ('application', 'APPLICATION_RESULT'), ('database', 'DATABASE_RESULT'),
                ('backend', 'BACKEND_RESULT'), ('native-image', 'NATIVE_RESULT'))})
    elif sys.argv[1:] == ['select']:
        event = os.environ['GITHUB_EVENT_NAME']
        paths = []
        if event == 'pull_request':
            paths = subprocess.check_output([
                'git', 'diff', '--name-only', '--no-renames', '-z',
                os.environ['BASE_SHA'], 'HEAD'
            ]).decode().split('\0')
        for name, required in select_scope(event, paths).items():
            print(name + '=' + str(required).lower())
    else:
        raise SystemExit('Usage: ci_scope.py select|verify')
