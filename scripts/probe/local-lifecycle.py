#!/usr/bin/env python3
"""Real process-death/restart test. Local disposable PostgreSQL; no cloud credentials."""
import json
import contextlib
import shutil
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[2]
JAVA = str(Path(os.environ['JAVA_HOME']) / 'bin/java')
JAR = ROOT / 'backend/target/forena-kotlin-probe.jar'
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']
DOCKER_ENV = {k: v for k, v in os.environ.items() if k not in ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']}
TOKEN = 'local-probe-token-not-for-cloud-credentials'
container = None
app = None
directory = None

def docker(*args, **kwargs):
    return subprocess.run(DOCKER + list(args), env=DOCKER_ENV, check=True, text=True, capture_output=True, **kwargs).stdout.strip()

def sql(query):
    return docker('exec', '-i', container, 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', input=query)

def call(path, body=None):
    request = urllib.request.Request(f'http://127.0.0.1:{port}{path}',
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=110) as response:
        return response.status, json.loads(response.read())

def start(log):
    process = subprocess.Popen([JAVA, '-jar', str(JAR)], env=env, stdout=log, stderr=subprocess.STDOUT)
    for _ in range(200):
        if process.poll() is not None:
            raise RuntimeError(f'Application exited {process.returncode}; see local log')
        try:
            if call('/actuator/health')[0] == 200:
                return process
        except (OSError, ValueError):
            time.sleep(0.1)
    process.terminate()
    raise TimeoutError('Application did not become ready')

try:
    container = docker('run', '-d', '--rm', '-e', 'POSTGRES_PASSWORD=local-probe-admin', '-p', '127.0.0.1::5432', 'postgres:17.6-alpine')
    for _ in range(150):
        try:
            sql('select 1;')
            break
        except subprocess.CalledProcessError:
            time.sleep(0.1)
    db_port = docker('port', container, '5432').rsplit(':', 1)[1]
    sql("CREATE SCHEMA forena_probe; CREATE ROLE forena_probe_runtime LOGIN PASSWORD 'local-probe-only';")
    import socket
    with socket.socket() as free_port:
        free_port.bind(('127.0.0.1', 0))
        port = free_port.getsockname()[1]
    env = os.environ | {'PORT': str(port), 'PROBE_JDBC_URL': f'jdbc:postgresql://127.0.0.1:{db_port}/postgres',
        'PROBE_DB_USERNAME': 'forena_probe_runtime', 'PROBE_DB_PASSWORD': 'local-probe-only',
        'PROBE_TOKEN': TOKEN, 'PROBE_ALLOW_CRASH': 'true'}
    directory = tempfile.mkdtemp(prefix='forena-lifecycle-')
    with contextlib.nullcontext(directory):
        with open(Path(directory) / 'migration.log', 'w') as log:
            subprocess.run([JAVA, '-jar', str(JAR)], env=env | {'PROBE_MIGRATE': 'true',
                'PROBE_MIGRATION_USERNAME': 'postgres', 'PROBE_MIGRATION_PASSWORD': 'local-probe-admin'},
                stdout=log, stderr=subprocess.STDOUT, check=True, timeout=60)
        with open(Path(directory) / 'application.log', 'w') as log:
            app = start(log)
            normal_id = str(uuid.uuid4())
            status, _ = call('/api/probes', {'id': normal_id, 'delayMs': 1500, 'mode': 'NORMAL'})
            assert status == 202
            sql(f"insert into forena_probe.probe_receipt(id) values ('{normal_id}');")
            # No more HTTP requests until completion is observed directly through PostgreSQL.
            for _ in range(100):
                result = sql(f"select e.completed_at > r.received_at from forena_probe.probe_effect e join forena_probe.probe_receipt r using(id) where id='{normal_id}';")
                if result == 't': break
                time.sleep(0.1)
            assert result == 't', 'No completion after client received response'
            crash_id = str(uuid.uuid4())
            assert call('/api/probes', {'id': crash_id, 'delayMs': 1500, 'mode': 'CRASH'})[0] == 202
            assert app.wait(timeout=15) == 137, 'Expected actual abrupt JVM termination'
            assert sql(f"select count(*) from forena_probe.probe_effect where id='{crash_id}';") == '0'
            assert sql(f"select count(*) from forena_probe.event_publication where serialized_event like '%{crash_id}%' and completion_date is null;") == '1'
            app = start(log)
            assert call(f'/api/probes/{crash_id}/recover', {})[0] == 200
            assert call(f'/api/probes/{crash_id}/recover', {})[0] == 200
            assert sql(f"select count(*) from forena_probe.probe_effect where id='{crash_id}';") == '1'
            assert sql(f"select count(distinct instance_id) from forena_probe.probe_attempt where run_id='{crash_id}';") == '2'
            print(json.dumps({'postResponseCompleted': True, 'actualJvmExit': 137, 'restartedJvmCompleted': True, 'effectCountAfterReplay': 1}))
except Exception:
    # Preserve diagnostics outside the repo, without printing environment variables or credentials.
    if 'directory' in locals() and Path(directory).exists():
        shutil.copytree(directory, '/tmp/forena-lifecycle-failure', dirs_exist_ok=True)
    raise
finally:
    if app and app.poll() is None:
        app.terminate()
        try: app.wait(timeout=10)
        except subprocess.TimeoutExpired: app.kill(); app.wait()
    if container:
        docker('rm', '-f', container)
    if directory and Path(directory).exists():
        shutil.rmtree(directory)
