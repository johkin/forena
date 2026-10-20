#!/usr/bin/env python3
"""Verify the CI image identity and select its immutable registry reference."""
import json
from pathlib import Path
import re
import subprocess
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


def image_reference(image):
    references = [ref for ref in image.get('RepoDigests', [])
                  if re.fullmatch(re.escape(REPOSITORY) + r'@sha256:[0-9a-f]{64}', ref)]
    if len(references) != 1:
        raise ValueError('Expected one immutable image reference in the target VCR repository')
    return references[0]


def dockerfile(image):
    # Services currently accepts Dockerfile entrypoints only. FROM alone keeps
    # the base image config/layers; verify-output checks that before deployment.
    return 'FROM ' + image_reference(image) + '\n'


def configure(config, image):
    image_reference(image)
    backend = config['services']['backend']
    if backend.get('root') != 'deploy/backend-image' or backend.get('runtime') != 'container':
        raise ValueError('Backend must use the prebuilt image service root')
    backend['entrypoint'] = 'Dockerfile'
    return config


def main():
    mode, metadata_path, inspect_path, commit = sys.argv[1:]
    metadata = json.loads(Path(metadata_path).read_text())
    image = json.loads(Path(inspect_path).read_text())[0]
    verify_image(image, metadata, commit)
    if mode == 'configure':
        path = Path('vercel.json')
        path.write_text(json.dumps(configure(json.loads(path.read_text()), image), indent=2) + '\n')
        Path('deploy/backend-image/Dockerfile').write_text(dockerfile(image))
    elif mode == 'verify-output':
        containers = [json.loads(p.read_text()) for p in Path('.vercel/output').rglob('.vc-config.json')]
        containers = [c for c in containers if c.get('runtime') == 'container']
        if len(containers) != 1:
            raise ValueError('Expected exactly one backend container in the deployment output')
        ref = containers[0].get('handler', '')
        image_reference({'RepoDigests': [ref]})
        selected = json.loads(subprocess.check_output(['docker', 'image', 'inspect', ref], text=True))[0]
        verify_image(selected, metadata, commit)
    elif mode != 'verify':
        raise ValueError('Expected verify or configure')
    print('Verified CI image identity for release ' + commit)


if __name__ == '__main__':
    main()
