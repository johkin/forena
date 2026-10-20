#!/usr/bin/env python3
"""Verify the CI image identity and select its immutable registry reference."""
import json
from pathlib import Path
import re
import sys
import os
import shutil

REPOSITORY = 'vcr.vercel.com/johkin/forena-kotlin/backend'


def verify_image(image, metadata, commit):
    if not re.fullmatch(r'[0-9a-f]{40}', commit) or metadata.get('sourceCommit') != commit:
        raise ValueError('Image was not built for this release commit')
    image_id = metadata.get('imageId', '')
    if not re.fullmatch(r'sha256:[0-9a-f]{64}', image_id) or image.get('Id') != image_id:
        raise ValueError('Image differs from the CI-tested artifact')
    if image.get('Os') != 'linux' or image.get('Architecture') != 'amd64':
        raise ValueError('Release requires linux/amd64')


def configure(image, public_key, certificate):
    references = [ref for ref in image.get('RepoDigests', [])
                  if re.fullmatch(re.escape(REPOSITORY) + r'@sha256:[0-9a-f]{64}', ref)]
    if len(references) != 1:
        raise ValueError('Expected one immutable image reference in the target VCR repository')
    if not re.fullmatch(r'sb_publishable_[A-Za-z0-9_-]+', public_key):
        raise ValueError('Expected the public Auth key')
    return {'handler': references[0], 'runtime': 'container', 'architecture': 'x86_64',
            'regions': ['fra1'], 'environment': {
                'PORT': '80',
                'FORENA_MIGRATE': 'false',
                'FORENA_AUTH_ISSUER': 'https://ckzrtxqjskosqzoitymc.supabase.co/auth/v1',
                'FORENA_AUTH_JWKS_URI': 'https://ckzrtxqjskosqzoitymc.supabase.co/auth/v1/.well-known/jwks.json',
                'FORENA_AUTH_PUBLISHABLE_KEY': public_key,
                'FORENA_WEB_SESSION_ENABLED': 'true',
                'FORENA_WEB_ORIGIN': 'https://forena-kotlin.vercel.app',
                'FORENA_DB_CA_CERTIFICATE': certificate}}


def routes():
    # Same request.path transform emitted by @vercel/container: retain API paths.
    return [
        {'src': '/(?:config\\.json|app-version\\.json|api(?:/.*)?)',
         'headers': {'Cache-Control': 'no-store'}, 'continue': True},
        {'src': '/(api(?:/.*)?|actuator/health)', 'dest': '/backend',
         'transforms': [{'type': 'request.path', 'op': 'set', 'args': '/$1'}]},
        {'handle': 'filesystem'},
        {'src': '/.*', 'dest': '/index.html'}]


def write_output(image):
    # Build Output API describes the deployment; it never reads or rebuilds the image.
    output = Path('.vercel/output')
    if output.exists():
        shutil.rmtree(output)
    function = output / 'functions/backend.func'
    function.mkdir(parents=True)
    descriptor = configure(image, os.environ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
                           Path('backend/certs/supabase-ca.crt').read_text())
    (function / '.vc-config.json').write_text(json.dumps(descriptor, indent=2) + '\n')
    shutil.copytree('frontend/dist', output / 'static')
    (output / 'config.json').write_text(json.dumps({'version': 3, 'routes': routes()}, indent=2) + '\n')


def main():
    mode, metadata_path, inspect_path, commit = sys.argv[1:]
    metadata = json.loads(Path(metadata_path).read_text())
    image = json.loads(Path(inspect_path).read_text())[0]
    verify_image(image, metadata, commit)
    if mode == 'configure':
        write_output(image)
    elif mode == 'verify-output':
        descriptor = json.loads(Path('.vercel/output/functions/backend.func/.vc-config.json').read_text())
        expected = configure(image, os.environ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'], '')
        if descriptor.get('runtime') != 'container' or descriptor.get('handler') != expected['handler'] or 'command' in descriptor:
            raise ValueError('Deployment output must select the tested image with its original entrypoint')
    elif mode != 'verify':
        raise ValueError('Expected verify or configure')
    print('Verified CI image identity for release ' + commit)


if __name__ == '__main__':
    main()
