#!/usr/bin/env python3
"""Real process-death/restart test. Local disposable PostgreSQL; no cloud credentials."""
import json
import argparse
import concurrent.futures
import contextlib
import shutil
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time
import urllib.request
import uuid

arguments = argparse.ArgumentParser(description=__doc__)
arguments.add_argument('--concurrent-recovery', action='store_true', help='Also race two separate JVM workers against one pending event')
arguments.add_argument('--scheduled-crash', action='store_true', help='Test SQL-armed one-shot faults through the worker before and after effect commit')
options = arguments.parse_args()

ROOT = Path(__file__).resolve().parents[2]
JAVA = str(Path(os.environ['JAVA_HOME']) / 'bin/java')
JAR = ROOT / 'backend/target/forena-kotlin-probe.jar'
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']
DOCKER_ENV = {k: v for k, v in os.environ.items() if k not in ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']}
TOKEN = 'local-probe-token-not-for-cloud-credentials'
WORKER_TOKEN = 'local-worker-token-not-for-cloud-credentials'
container = None
app = None
second_app = None
directory = None

def docker(*args, **kwargs):
    return subprocess.run(DOCKER + list(args), env=DOCKER_ENV, check=True, text=True, capture_output=True, **kwargs).stdout.strip()

def sql(query):
    # The image's temporary initialization server accepts Unix sockets before
    # shutting down. TCP becomes ready only on the final PostgreSQL server.
    return docker('exec', '-i', '-e', 'PGPASSWORD=local-probe-admin', container,
        'psql', '-h', '127.0.0.1', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', input=query)

def call(path, body=None, token=TOKEN):
    request = urllib.request.Request(f'http://127.0.0.1:{port}{path}',
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
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
    else:
        raise TimeoutError('PostgreSQL did not become ready over TCP')
    db_port = docker('port', container, '5432').rsplit(':', 1)[1]
    sql("CREATE SCHEMA forena_probe; CREATE ROLE forena_probe_runtime LOGIN PASSWORD 'local-probe-only';")
    import socket
    with socket.socket() as free_port:
        free_port.bind(('127.0.0.1', 0))
        port = free_port.getsockname()[1]
    env = os.environ | {'PORT': str(port), 'PROBE_JDBC_URL': f'jdbc:postgresql://127.0.0.1:{db_port}/postgres',
        'PROBE_DB_USERNAME': 'forena_probe_runtime', 'PROBE_DB_PASSWORD': 'local-probe-only',
        'PROBE_TOKEN': TOKEN, 'PROBE_ALLOW_CRASH': 'true', 'PROBE_WORKER_TOKEN': WORKER_TOKEN,
        'SPRING_APPLICATION_JSON': json.dumps({'probe': {'worker': {'stale-after': 'PT0S'}}})}
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
            if options.scheduled_crash:
                fault_results = []
                for point, expected_effects in [('BEFORE_EFFECT', 0), ('AFTER_EFFECT_COMMIT', 1)]:
                    fault_id = str(uuid.uuid4())
                    assert call('/api/probes', {'id': fault_id, 'delayMs': 0, 'mode': 'BLOCK'})[0] == 202
                    for _ in range(100):
                        failed = sql(f"select count(*) from forena_probe.event_publication where serialized_event like '%{fault_id}%' and status='FAILED';")
                        if failed == '1': break
                        time.sleep(.1)
                    assert failed == '1'
                    sql(f"insert into forena_probe.probe_fault(id,point) values ('{fault_id}','{point}');")
                    try:
                        call('/api/probes/worker', {}, WORKER_TOKEN)
                    except OSError:
                        pass  # A broken HTTP connection is expected, but is not the death evidence.
                    assert app.wait(timeout=15) == 137
                    before = int(sql(f"select count(*) from forena_probe.probe_effect where id='{fault_id}';"))
                    assert before == expected_effects
                    assert sql(f"select count(*) from forena_probe.event_publication where serialized_event like '%{fault_id}%' and completion_date is null;") == '1'
                    crashed = sql(f"select consumed_by from forena_probe.probe_fault where id='{fault_id}' and consumed_at is not null;")
                    assert crashed
                    app = start(log)
                    assert call('/api/probes/worker', {}, WORKER_TOKEN)[0] == 200
                    assert call('/api/probes/worker', {}, WORKER_TOKEN)[0] == 200
                    assert sql(f"select count(*) from forena_probe.probe_effect where id='{fault_id}';") == '1'
                    assert sql(f"select count(*) from forena_probe.event_publication where serialized_event like '%{fault_id}%' and completion_date is null;") == '0'
                    boots = int(sql(f"select count(distinct instance_id) from forena_probe.probe_attempt where run_id='{fault_id}';"))
                    assert boots >= 2
                    fault_results.append({'point': point, 'id': fault_id, 'jvmExit': 137,
                        'effectsBeforeRecovery': before, 'pendingBeforeRecovery': 1,
                        'effectsAfterRepeatedRecovery': 1, 'pendingAfterRecovery': 0, 'distinctJvms': boots})
                print(json.dumps({'workerCrashRecovery': fault_results}), flush=True)

            if options.concurrent_recovery:
                first_port = port
                first_env = env
                with socket.socket() as free_port:
                    free_port.bind(('127.0.0.1', 0))
                    port = free_port.getsockname()[1]
                second_port = port
                env = env | {'PORT': str(second_port)}
                second_app = start(log)
                port = first_port
                env = first_env
                def post_to(target_port, path, body):
                    request = urllib.request.Request(f'http://127.0.0.1:{target_port}{path}',
                        data=json.dumps(body).encode(), headers={'Authorization': 'Bearer ' + (WORKER_TOKEN if path == '/api/probes/worker' else TOKEN), 'Content-Type': 'application/json'})
                    with urllib.request.urlopen(request, timeout=110) as response:
                        return response.status, json.loads(response.read())
                # Confirm separate JVM identities through ordinary completed effects.
                boot_ids = []
                for target in [first_port, second_port]:
                    identity = str(uuid.uuid4())
                    assert post_to(target, '/api/probes', {'id': identity, 'delayMs': 0, 'mode': 'NORMAL'})[0] == 202
                    for _ in range(100):
                        boot_id = sql(f"select instance_id from forena_probe.probe_effect where id='{identity}';")
                        if boot_id: break
                        time.sleep(.1)
                    assert boot_id
                    boot_ids.append(boot_id)
                assert len(set(boot_ids)) == 2, 'Expected two distinct JVMs'
                runs=[]
                for _ in range(3):
                    shared_id = str(uuid.uuid4())
                    assert post_to(first_port, '/api/probes', {'id': shared_id, 'delayMs': 1000, 'mode': 'BLOCK'})[0] == 202
                    for _ in range(100):
                        failed = sql(f"select count(*) from forena_probe.event_publication where serialized_event like '%{shared_id}%' and status='FAILED';")
                        if failed == '1': break
                        time.sleep(.1)
                    assert failed == '1'
                    gate = threading.Barrier(2)
                    def recover(target):
                        gate.wait(timeout=10)
                        return post_to(target, '/api/probes/worker' if options.scheduled_crash else f'/api/probes/{shared_id}/recover', {})[0]
                    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                        results = list(pool.map(recover, [first_port, second_port]))
                    assert results == [200, 200], results
                    effects = int(sql(f"select count(*) from forena_probe.probe_effect where id='{shared_id}';"))
                    assert effects == 1
                    for _ in range(100):
                        unfinished = sql(f"select count(*) from forena_probe.event_publication where serialized_event like '%{shared_id}%' and completion_date is null;")
                        if unfinished == '0': break
                        time.sleep(.1)
                    assert unfinished == '0'
                    attempts = int(sql(f"select count(*) from forena_probe.probe_attempt where run_id='{shared_id}';"))
                    attempting_jvms = int(sql(f"select count(distinct instance_id) from forena_probe.probe_attempt where run_id='{shared_id}';"))
                    runs.append({'id':shared_id,'responses':results,'effects':effects,'pendingPublications':0,
                        'attempts':attempts,'attemptingJvms':attempting_jvms})
                print(json.dumps({'distinctJvms':len(set(boot_ids)), 'concurrentRecovery':runs}),flush=True)

except Exception:
    # Preserve diagnostics outside the repo, without printing environment variables or credentials.
    if directory and Path(directory).exists():
        shutil.copytree(directory, '/tmp/forena-lifecycle-failure', dirs_exist_ok=True)
    raise
finally:
    if second_app and second_app.poll() is None:
        second_app.terminate()
        try: second_app.wait(timeout=10)
        except subprocess.TimeoutExpired: second_app.kill(); second_app.wait()
    if app and app.poll() is None:
        app.terminate()
        try: app.wait(timeout=10)
        except subprocess.TimeoutExpired: app.kill(); app.wait()
    if container:
        docker('rm', '-f', container)
    if directory and Path(directory).exists():
        shutil.rmtree(directory)
