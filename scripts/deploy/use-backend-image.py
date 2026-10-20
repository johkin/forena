#!/usr/bin/env python3
"""Verify the CI image identity and select its immutable registry reference."""
import json
from pathlib import Path
import re
import sys

REPOSITORY = 'vcr.vercel.com/johkin/forena-kotlin/backend'


def verify_image(image, metadata, commit):
    if not re.fullmatch(r'[0-9a-f]{40}', commit) or metadata.get('sourceCommit') != commit:
        raise ValueError('Image was not built for this release commit')
    image_id = metadata.get('imageId', '')
    if not re.fullmatch(r'sha256:[0-9a-f]{64}', image_id) or image.get('Id') != image_id:
        raise ValueError('Image differs from the CI-tested artifact')
    if image.get('Os') != 'linux' or image.get('Architecture') != 'amd64':
        raise ValueError('Release requires linux/amd64')


def configure(config, image):
    references = [ref for ref in image.get('RepoDigests', [])
                  if re.fullmatch(re.escape(REPOSITORY) + r'@sha256:[0-9a-f]{64}', ref)]
    if len(references) != 1:
        raise ValueError('Expected one immutable image reference in the target VCR repository')
    backend = config['services']['backend']
    if backend.get('root') != 'deploy/backend-image' or backend.get('runtime') != 'container':
        raise ValueError('Backend must use the prebuilt image service root')
    backend['entrypoint'] = references[0]
    return config


def main():
    mode, metadata_path, inspect_path, commit = sys.argv[1:]
    metadata = json.loads(Path(metadata_path).read_text())
    image = json.loads(Path(inspect_path).read_text())[0]
    verify_image(image, metadata, commit)
    if mode == 'configure':
        path = Path('vercel.json')
        path.write_text(json.dumps(configure(json.loads(path.read_text()), image), indent=2) + '\n')
    elif mode != 'verify':
        raise ValueError('Expected verify or configure')
    print('Verified CI image identity for release ' + commit)


if __name__ == '__main__':
    main()
