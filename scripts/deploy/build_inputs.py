"""Content keys for independently reusable production builds (no runtime secrets)."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone

PUBLIC_CONFIG = ('FORENA_KOTLIN_TEST_ACTIVITY_ID',)
COMMON = {'scripts/deploy/build_inputs.py', '.github/workflows/ci.yml', '.gitattributes'}


def fingerprint(component, root=Path('.'), *, configuration=None, node_version=None):
    if component not in ('backend', 'frontend'):
        raise ValueError('Expected backend or frontend')
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0')
    paths = []
    for name in filter(None, tracked):
        if name in {'backend/README.md', 'frontend/README.md'} or name.startswith(
                ('docs/', 'backend/docs/', 'frontend/docs/')):
            continue
        included = name in COMMON
        if component == 'backend':
            included |= name.startswith('backend/') or name == 'scripts/deploy/use-backend-image.py'
        else:
            # Vite can import shared components, styles and utilities through @/.
            included |= name.startswith(('frontend/', 'src/', 'public/')) or name in {
                'package.json', 'package-lock.json', 'tsconfig.json', '.npmrc',
                '.github/workflows/deploy-kotlin.yml'}
        if included:
            paths.append(name)
    digest = hashlib.sha256()
    for name in sorted(paths):
        path = root / name
        # Length-prefix every field; include executable bits and symlink targets.
        content = os.readlink(path).encode() if path.is_symlink() else path.read_bytes()
        for field in (name.encode(), str(path.lstat().st_mode & 0o111).encode(), content):
            digest.update(len(field).to_bytes(8, 'big'))
            digest.update(field)
    if component == 'frontend':
        configuration = os.environ if configuration is None else configuration
        node_version = node_version or subprocess.check_output(['node', '--version'], text=True).strip()
        digest.update(json.dumps({'node': node_version, 'public': {
            name: configuration.get(name, '') for name in PUBLIC_CONFIG}}, sort_keys=True).encode())
    return digest.hexdigest()


if __name__ == '__main__':
    print('fingerprint=' + fingerprint(sys.argv[1]))
    # Refresh mutable buildpack/base-image inputs at least once per UTC week.
    print('epoch=' + datetime.now(timezone.utc).strftime('%G-W%V'))
