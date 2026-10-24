#!/usr/bin/env python3
"""Verify the CI image identity and select its immutable registry reference."""
import json
import hashlib
from pathlib import Path
import re
import sys
import os
import shutil

from build_inputs import fingerprint

REPOSITORY = 'vcr.vercel.com/johkin/forena-kotlin/backend'


def verify_migration_jar(metadata, path):
    expected = metadata.get('migrationJarSha256', '')
    if not re.fullmatch(r'[0-9a-f]{64}', expected) or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError('Migration JAR differs from the verified backend build')


def verify_image(image, metadata, commit):
    if not re.fullmatch(r'[0-9a-f]{40}', commit) or metadata.get('verifiedCommit') != commit:
        raise ValueError('Image was not verified for this release commit')
    if not re.fullmatch(r'[0-9a-f]{40}', metadata.get('sourceCommit', '')):
        raise ValueError('Missing original build commit')
    if metadata.get('buildInputs') != fingerprint('backend'):
        raise ValueError('Image build inputs differ from this release')
    image_id = metadata.get('imageId', '')
    if not re.fullmatch(r'sha256:[0-9a-f]{64}', image_id) or image.get('Id') != image_id:
        raise ValueError('Image differs from the CI-tested artifact')
    if image.get('Os') != 'linux' or image.get('Architecture') != 'amd64':
        raise ValueError('Release requires linux/amd64')


def record_image(image, commit, previous=None):
    if previous is not None:
        verify_image(image, previous, previous.get('verifiedCommit', ''))
    metadata = {'sourceCommit': previous['sourceCommit'] if previous else commit,
                'verifiedCommit': commit, 'buildInputs': fingerprint('backend'),
                'imageId': image['Id']}
    verify_image(image, metadata, commit)
    return metadata


def configure(image, certificate):
    references = [ref for ref in image.get('RepoDigests', [])
                  if re.fullmatch(re.escape(REPOSITORY) + r'@sha256:[0-9a-f]{64}', ref)]
    if len(references) != 1:
        raise ValueError('Expected one immutable image reference in the target VCR repository')
    return {'handler': references[0], 'runtime': 'container', 'architecture': 'x86_64',
            'regions': ['fra1'], 'environment': {
                'PORT': '80',
                'FORENA_MIGRATE': 'true',
                'FORENA_WEB_SESSION_ENABLED': 'true',
                'FORENA_WEB_ORIGIN': 'https://forena-kotlin.vercel.app',
                'FORENA_TRUST_VERCEL_PROXY': 'true',
                'FORENA_DB_CA_CERTIFICATE': certificate}}


def routes():
    # Same request.path transform emitted by @vercel/container: retain API paths.
    return [
        {'src': '/(?:config\\.json|app-version\\.json|api(?:/.*)?)',
         'headers': {'Cache-Control': 'no-store'}, 'continue': True},
        {'src': '/(api(?:/.*)?|oauth2(?:/.*)?|\\.well-known/oauth-authorization-server|\\.well-known/oauth-protected-resource(?:/.*)?|actuator/health)', 'dest': '/backend',
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
    descriptor = configure(image, Path('backend/certs/supabase-ca.crt').read_text())
    (function / '.vc-config.json').write_text(json.dumps(descriptor, indent=2) + '\n')
    shutil.copytree('frontend/dist', output / 'static')
    (output / 'config.json').write_text(json.dumps({'version': 3, 'routes': routes()}, indent=2) + '\n')


def main():
    mode, metadata_path, inspect_path, commit = sys.argv[1:]
    image = json.loads(Path(inspect_path).read_text())[0]
    path = Path(metadata_path)
    metadata = json.loads(path.read_text()) if path.exists() else None
    if mode == 'record':
        metadata = record_image(image, commit, metadata)
        metadata['migrationJarSha256'] = hashlib.sha256((path.parent / 'forena-api.jar').read_bytes()).hexdigest()
        path.write_text(json.dumps(metadata, indent=2) + '\n')
        return
    if mode == 'verify-cache':
        verify_image(image, metadata, metadata.get('verifiedCommit', ''))
        verify_migration_jar(metadata, path.parent / 'forena-api.jar')
        return
    verify_image(image, metadata, commit)
    if mode == 'configure':
        write_output(image)
    elif mode == 'verify-output':
        descriptor = json.loads(Path('.vercel/output/functions/backend.func/.vc-config.json').read_text())
        expected = configure(image, '')
        if descriptor.get('runtime') != 'container' or descriptor.get('handler') != expected['handler'] or 'command' in descriptor:
            raise ValueError('Deployment output must select the tested image with its original entrypoint')
    elif mode != 'verify':
        raise ValueError('Expected verify, configure, verify-output, verify-cache or record')
    print('Verified CI image identity for release ' + commit)


if __name__ == '__main__':
    main()
