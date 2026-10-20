#!/usr/bin/env python3
"""Extract the web executable from the exact native container tested by CI."""
import json
from pathlib import Path
import subprocess


def docker(*args):
    return subprocess.check_output(['docker', *args], text=True).strip()


def web_command(config):
    metadata = json.loads(config['Labels']['io.buildpacks.build.metadata'])
    web = [process for process in metadata['processes'] if process['type'] == 'web']
    if len(web) != 1:
        raise ValueError('Expected one buildpack web process')
    command = web[0]['command']
    if isinstance(command, list):
        if len(command) != 1:
            raise ValueError('Expected a direct native executable')
        command = command[0]
    if not command.startswith(('/workspace/', '/layers/')) or web[0].get('args'):
        raise ValueError('Unexpected native web command')
    return command


def main():
    image = 'forena-api-native:ci'
    config = json.loads(docker('image', 'inspect', image))[0]
    if config['Architecture'] != 'amd64' or config['Os'] != 'linux':
        raise ValueError('Release requires linux/amd64')
    command = web_command(config['Config'])
    target = Path('backend/api/target/forena-api')
    target.parent.mkdir(parents=True, exist_ok=True)
    container = docker('create', image)
    try:
        subprocess.run(['docker', 'cp', '-L', f'{container}:{command}', str(target)], check=True)
        with target.open('rb') as binary:
            header = binary.read(20)
        # ELF64, little-endian, x86-64. Never silently package a launcher or JAR.
        if header[:6] != b'\x7fELF\x02\x01' or header[18:20] != b'\x3e\x00':
            raise ValueError('Web process is not a linux/amd64 native executable')
        target.chmod(0o755)
        print(f'Native release: {config["Id"]}, {target.stat().st_size} bytes')
    finally:
        docker('rm', container)


if __name__ == '__main__':
    main()
