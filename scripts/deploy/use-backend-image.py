#!/usr/bin/env python3
"""Verify the CI image identity and select its immutable registry reference."""
import json
import hashlib
from pathlib import Path
import re
import sys
import os
import shutil
import tarfile

from build_inputs import fingerprint

REPOSITORY = 'vcr.vercel.com/johkin/forena-kotlin/backend'
DIGEST = r'sha256:[0-9a-f]{64}'
MANIFEST_TYPES = {'application/vnd.docker.distribution.manifest.v2+json',
                  'application/vnd.oci.image.manifest.v1+json'}
CONFIG_TYPES = {'application/vnd.docker.container.image.v1+json',
                'application/vnd.oci.image.config.v1+json'}
LAYER_TYPES = {'application/vnd.docker.image.rootfs.diff.tar.gzip',
               'application/vnd.oci.image.layer.v1.tar+gzip'}


def verify_migration_jar(metadata, path):
    expected = metadata.get('migrationJarSha256', '')
    if not re.fullmatch(r'[0-9a-f]{64}', expected) or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError('Migration JAR differs from the verified backend build')


def verify_metadata(metadata, commit):
    if not isinstance(metadata, dict):
        raise ValueError('Missing verified backend metadata')
    if not re.fullmatch(r'[0-9a-f]{40}', commit) or metadata.get('verifiedCommit') != commit:
        raise ValueError('Image was not verified for this release commit')
    if not re.fullmatch(r'[0-9a-f]{40}', metadata.get('sourceCommit', '')):
        raise ValueError('Missing original build commit')
    if metadata.get('buildInputs') != fingerprint('backend'):
        raise ValueError('Image build inputs differ from this release')
    if not re.fullmatch(DIGEST, metadata.get('imageId', '')):
        raise ValueError('Missing verified source image identity')
    if not re.fullmatch(DIGEST, metadata.get('configDigest', '')):
        raise ValueError('Missing verified image config digest')


def verify_image(image, metadata, commit):
    verify_metadata(metadata, commit)
    image_id = metadata.get('imageId', '')
    if image.get('Id') != image_id:
        raise ValueError('Image differs from the CI-tested artifact')
    if image.get('Os') != 'linux' or image.get('Architecture') != 'amd64':
        raise ValueError('Release requires linux/amd64')


def archive_config_digest(path):
    with tarfile.open(path, 'r:*') as archive:
        def read_member(name):
            members = [member for member in archive.getmembers() if member.name == name]
            if len(members) != 1 or not members[0].isfile():
                raise ValueError('Expected one regular Docker archive member: ' + name)
            with archive.extractfile(members[0]) as stream:
                return stream.read()

        manifest = json.loads(read_member('manifest.json'))
        if not isinstance(manifest, list) or len(manifest) != 1 or not isinstance(manifest[0], dict):
            raise ValueError('Expected one image in the Docker archive')
        config_path = manifest[0].get('Config')
        if not isinstance(config_path, str) or not config_path:
            raise ValueError('Missing Docker archive config file')
        raw_config = read_member(config_path)
        config = json.loads(raw_config)
        if not isinstance(config, dict) or config.get('os') != 'linux' or config.get('architecture') != 'amd64':
            raise ValueError('Release requires linux/amd64')
        return 'sha256:' + hashlib.sha256(raw_config).hexdigest()


def verify_archive(metadata, path):
    if archive_config_digest(path) != metadata.get('configDigest'):
        raise ValueError('Image archive config differs from the verified backend build')


def record_image(image, commit, archive, previous=None):
    config_digest = archive_config_digest(archive)
    if previous is not None:
        verify_image(image, previous, previous.get('verifiedCommit', ''))
        if config_digest != previous.get('configDigest'):
            raise ValueError('Image archive config differs from the verified backend build')
    metadata = {'sourceCommit': previous['sourceCommit'] if previous else commit,
                'verifiedCommit': commit, 'buildInputs': fingerprint('backend'),
                'imageId': image['Id'], 'configDigest': config_digest}
    verify_image(image, metadata, commit)
    return metadata


def published_reference(raw_manifest, metadata, commit):
    verify_metadata(metadata, commit)
    manifest = json.loads(raw_manifest)
    if (not isinstance(manifest, dict) or manifest.get('schemaVersion') != 2
            or manifest.get('mediaType') not in MANIFEST_TYPES):
        raise ValueError('Expected a single Docker schema2 or OCI image manifest')
    config = manifest.get('config')
    if (not isinstance(config, dict) or config.get('mediaType') not in CONFIG_TYPES
            or config.get('digest') != metadata['configDigest']):
        raise ValueError('Published image config differs from the CI-tested image')
    layers = manifest.get('layers')
    if not isinstance(layers, list) or not layers:
        raise ValueError('Missing published image layers')
    for layer in layers:
        if (not isinstance(layer, dict) or layer.get('mediaType') not in LAYER_TYPES
                or not re.fullmatch(DIGEST, layer.get('digest', ''))):
            raise ValueError('Published image requires gzip-compressed image layers')
    return REPOSITORY + '@sha256:' + hashlib.sha256(raw_manifest).hexdigest()


def configure(raw_manifest, metadata, commit, certificate):
    return {'handler': published_reference(raw_manifest, metadata, commit), 'runtime': 'container', 'architecture': 'x86_64',
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
        {'src': '/(?:config\\.json|app-version\\.json|api(?:/.*)?|internal/notifications(?:/.*)?)',
         'headers': {'Cache-Control': 'no-store'}, 'continue': True},
        {'src': '/(api(?:/.*)?|internal/notifications(?:/.*)?|oauth2(?:/.*)?|\\.well-known/oauth-authorization-server|\\.well-known/oauth-protected-resource(?:/.*)?|actuator/health)', 'dest': '/backend',
         'transforms': [{'type': 'request.path', 'op': 'set', 'args': '/$1'}]},
        {'handle': 'filesystem'},
        {'src': '/.*', 'dest': '/index.html'}]


def write_output(raw_manifest, metadata, commit):
    # Build Output API describes the deployment; it never reads or rebuilds the image.
    descriptor = configure(raw_manifest, metadata, commit, Path('backend/certs/supabase-ca.crt').read_text())
    output = Path('.vercel/output')
    if output.exists():
        shutil.rmtree(output)
    function = output / 'functions/backend.func'
    function.mkdir(parents=True)
    (function / '.vc-config.json').write_text(json.dumps(descriptor, indent=2) + '\n')
    shutil.copytree('frontend/dist', output / 'static')
    (output / 'config.json').write_text(json.dumps({'version': 3, 'routes': routes()}, indent=2) + '\n')


def main():
    mode, metadata_path, input_path, commit = sys.argv[1:]
    path = Path(metadata_path)
    metadata = json.loads(path.read_text()) if path.exists() else None
    if mode == 'record':
        image = json.loads(Path(input_path).read_text())[0]
        metadata = record_image(image, commit, path.parent / 'forena-backend.tar.gz', metadata)
        metadata['migrationJarSha256'] = hashlib.sha256((path.parent / 'forena-api.jar').read_bytes()).hexdigest()
        path.write_text(json.dumps(metadata, indent=2) + '\n')
        return
    if mode == 'verify-cache':
        image = json.loads(Path(input_path).read_text())[0]
        verify_image(image, metadata, metadata.get('verifiedCommit', ''))
        verify_archive(metadata, path.parent / 'forena-backend.tar.gz')
        verify_migration_jar(metadata, path.parent / 'forena-api.jar')
        return
    if mode == 'configure':
        write_output(Path(input_path).read_bytes(), metadata, commit)
    elif mode == 'verify-output':
        descriptor = json.loads(Path('.vercel/output/functions/backend.func/.vc-config.json').read_text())
        expected = configure(Path(input_path).read_bytes(), metadata, commit, '')
        if (descriptor.get('runtime') != 'container' or descriptor.get('handler') != expected['handler']
                or descriptor.get('architecture') != expected['architecture'] or 'command' in descriptor):
            raise ValueError('Deployment output must select the tested image with its original entrypoint')
    elif mode == 'verify':
        image = json.loads(Path(input_path).read_text())[0]
        verify_image(image, metadata, commit)
    else:
        raise ValueError('Expected verify, configure, verify-output, verify-cache or record')
    print('Verified CI image identity for release ' + commit)


if __name__ == '__main__':
    main()
