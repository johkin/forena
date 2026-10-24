"""Select affected checks and reuse verified backend builds for main releases."""
import os
from pathlib import PurePosixPath
import re
import subprocess
import sys

COMPONENTS = ('application', 'database', 'backend', 'native')


def select_scope(event, paths, *, backend_cache_hit=False):
    if event not in {'pull_request', 'push'} or paths is None:
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
        elif path in {'scripts/deploy/build_inputs.py', 'scripts/deploy/use-backend-image.py',
                      'scripts/deploy/ci_scope.py', 'scripts/deploy/test_ci_scope.py',
                      '.github/workflows/ci.yml',
                      'scripts/migration/activity-management-browser.mjs',
                      'scripts/migration/auth-browser.mjs'}:
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
    if event == 'push':
        # A missing/expired exact-key cache must produce a fresh release image.
        scope['backend'] |= not backend_cache_hit
        scope['native'] = True
    else:
        scope['native'] = scope['backend']
    return scope


def changed_paths(base, root=None):
    """An unknown baseline cannot establish that any component is unchanged."""
    if not re.fullmatch(r'[0-9a-f]{40}', base or ''):
        return None
    ancestor = subprocess.run(['git', 'merge-base', '--is-ancestor', base, 'HEAD'],
                              cwd=root, stderr=subprocess.DEVNULL)
    if ancestor.returncode != 0:
        return None
    return subprocess.check_output([
        'git', 'diff', '--name-only', '--no-renames', '-z', base, 'HEAD'
    ], cwd=root).decode().split('\0')


def verify_results(required, scope_result, results):
    if scope_result != 'success' or set(required) != set(COMPONENTS):
        raise ValueError('CI scope did not finish successfully')
    if required['backend'] == 'true' and required['native'] != 'true':
        raise ValueError('Backend changes require native verification')
    for component, value in required.items():
        if value not in {'true', 'false'}:
            raise ValueError('Missing or invalid CI scope')
        expected = 'success' if value == 'true' else 'skipped'
        job = 'native-image' if component == 'native' else component
        if results.get(job) != expected:
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
        paths = changed_paths(os.environ.get('BASE_SHA'))
        for name, required in select_scope(event, paths,
                backend_cache_hit=os.environ.get('BACKEND_CACHE_HIT') == 'true').items():
            print(name + '=' + str(required).lower())
    else:
        raise SystemExit('Usage: ci_scope.py select|verify')
