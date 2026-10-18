#!/usr/bin/env python3
"""M22E/F: disposable local PostgreSQL + two real JVMs; never accepts remote targets.
Build backend first with the pinned JDK. Output contains synthetic metrics only.
"""
import argparse
import concurrent.futures
import hashlib
import json
import math
import os
from pathlib import Path
import re
import socket
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[2]
JAVA = str(Path(os.environ['JAVA_HOME']) / 'bin/java')
JAR = ROOT / 'backend/target/forena-kotlin-probe.jar'
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']
ENV = {k: v for k, v in os.environ.items() if k not in
       ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']}
TOKEN = 'local-capacity-probe-not-a-cloud-credential'
WORKER = 'local-capacity-worker-not-a-cloud-credential'
LISTENER = 'se.forena.probe.effects.internal.ProbeListener.on(se.forena.probe.commands.ProbeRequested)'
EVENT = 'se.forena.probe.commands.ProbeRequested'


def percentile(values, quantile=.95):
    return sorted(values)[max(0, math.ceil(len(values) * quantile) - 1)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--quick', action='store_true', help='Smaller CI query matrix, same failure scenarios')
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--recovery-cadence', action='store_true', help='M22F: missed tick and persistent cursor through deferred backlog')
    args = parser.parse_args()
    container, processes, blockers = None, [], []
    observations = {'kind': 'local-only', 'base': 'a3ff203', 'queryPlans': [], 'delivery': [], 'faults': []}

    def docker(*arguments, **kwargs):
        return subprocess.run(DOCKER + list(arguments), env=ENV, check=True, capture_output=True,
                              text=True, timeout=60, **kwargs).stdout.strip()

    def sql(query):
        return docker('exec', '-i', '-e', 'PGPASSWORD=local-capacity-admin', container,
                      'psql', '-h', '127.0.0.1', '-U', 'postgres', '-Atq', '-v', 'ON_ERROR_STOP=1', input=query)

    def json_sql(query):
        return json.loads(sql(query))

    def request(port, path, body=None, worker=False):
        started = time.monotonic()
        req = urllib.request.Request(f'http://127.0.0.1:{port}{path}',
            data=json.dumps(body).encode() if body is not None else None,
            headers={'Authorization': 'Bearer ' + (WORKER if worker else TOKEN), 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=35) as response:
                return response.status, json.loads(response.read()), (time.monotonic() - started) * 1000
        except urllib.error.HTTPError as error:
            error.close()
            return error.code, None, (time.monotonic() - started) * 1000

    def clear():
        # Only the disposable container created above; no connection arguments or cloud URL accepted.
        sql('truncate forena_probe.event_publication, forena_probe.probe_run cascade; update forena_probe.probe_worker_cursor set publication_date=null,publication_id=null,revision=revision+1;')

    def seed(count, delay=0, fresh=False, mixed=False, age_seconds=300):
        age = "interval '-1 day'" if fresh else f"interval '{age_seconds} seconds'"
        sql(f"""
            with runs as (
                insert into forena_probe.probe_run(id,delay_ms,mode,requested_at)
                select gen_random_uuid(), {delay}, 'BLOCK', clock_timestamp() - {age}
                from generate_series(1, {count}) returning *
            ), numbered as (select *, row_number() over () n from runs)
            insert into forena_probe.event_publication(id,listener_id,event_type,serialized_event,
                publication_date,completion_date,status,completion_attempts)
            select gen_random_uuid(), case when {'true' if mixed else 'false'} and n % 4 = 0
                then 'capacity-other-listener' else '{LISTENER}' end,
                '{EVENT}', jsonb_build_object('id',id,'delayMs',delay_ms,'mode',mode,
                'requestedAt',to_char(requested_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'))::text,
                requested_at, null, case when n % 2 = 0 then 'FAILED' else 'PROCESSING' end, 1 from numbered;
        """)

    def counts():
        return json_sql("""select json_build_object(
            'effects',(select count(*) from forena_probe.probe_effect),
            'attempts',(select count(*) from forena_probe.probe_attempt),
            'attemptingJvms',(select count(distinct instance_id) from forena_probe.probe_attempt),
            'oldestPendingAgeSeconds',(select coalesce(max(extract(epoch from clock_timestamp()-publication_date)),0)
                from forena_probe.event_publication where completion_date is null
                and publication_date < clock_timestamp() and listener_id != 'capacity-other-listener'),
            'pending',(select count(*) from forena_probe.event_publication where completion_date is null
                and publication_date < clock_timestamp() and listener_id != 'capacity-other-listener'))""")

    def lock_for(query, seconds):
        command = DOCKER + ['exec', '-i', '-e', 'PGPASSWORD=local-capacity-admin', container,
                            'psql', '-h', '127.0.0.1', '-U', 'postgres', '-Atq', '-v', 'ON_ERROR_STOP=1']
        proc = subprocess.Popen(command, env=ENV, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, text=True)
        blockers.append(proc)
        proc.stdin.write(f"begin; {query}; select 'CAPACITY_LOCKED'; select pg_sleep({seconds}); commit;\n")
        proc.stdin.close()
        while True:
            line = proc.stdout.readline()
            if 'CAPACITY_LOCKED' in line:
                return proc
            if not line:
                raise RuntimeError('Lock fixture failed')

    def sample(stop, samples):
        while not stop.is_set():
            db = json_sql("""select coalesce(json_agg(t),'[]') from (
                select application_name, count(*) connections,
                    count(*) filter(where state='active') active,
                    count(*) filter(where wait_event_type='Lock') waiting
                from pg_stat_activity where application_name like 'forena-capacity-%' group by application_name
            ) t""")
            rss = []
            for p in processes:
                status = Path(f'/proc/{p.pid}/status').read_text()
                rss.append({key: int(re.search(rf'^{key}:\s+(\d+)', status, re.M)[1])
                            for key in ['VmRSS', 'VmHWM']})
            samples.append({'elapsed': time.monotonic(), 'database': db, 'jvmKiB': rss})
            stop.wait(.2)

    def measured(action):
        samples, stop, failures = [], threading.Event(), []
        def cpu_seconds():
            return [sum(int(x) for x in Path(f'/proc/{p.pid}/stat').read_text().split()[13:15]) /
                    os.sysconf('SC_CLK_TCK') for p in processes]
        cpu_before = cpu_seconds()
        def guarded_sample():
            try: sample(stop, samples)
            except Exception as exc: failures.append(type(exc).__name__)
        thread = threading.Thread(target=guarded_sample)
        thread.start()
        try: result = action()
        finally:
            stop.set()
            thread.join(timeout=10)
        assert not thread.is_alive() and not failures and samples, failures
        return result, {'samples': len(samples), 'targetIntervalSeconds': .2,
            'processCpuSeconds': [after - before for after, before in zip(cpu_seconds(), cpu_before)],
            'peakConnections': {f'jvm{i+1}': max((row['connections'] for s in samples for row in s['database']
                if row['application_name'] == f'forena-capacity-{i+1}'), default=0) for i in range(2)},
            'peakLockWaiters': max(sum(row['waiting'] for row in s['database']) for s in samples),
            'peakRssKiB': [max(s['jvmKiB'][i]['VmRSS'] for s in samples) for i in range(2)],
            'processHighWaterKiB': [max(s['jvmKiB'][i]['VmHWM'] for s in samples) for i in range(2)]}

    try:
        container = docker('run', '-d', '--rm', '-e', 'POSTGRES_PASSWORD=local-capacity-admin',
                           '-p', '127.0.0.1::5432', 'postgres:17.6-alpine', 'postgres',
                           '-c', 'shared_preload_libraries=pg_stat_statements')
        for _ in range(150):
            try:
                sql('select 1;')
                break
            except subprocess.CalledProcessError: time.sleep(.1)
        else: raise TimeoutError('PostgreSQL readiness')
        sql("create schema forena_probe; create role forena_probe_runtime login password 'local-probe-only'; create extension pg_stat_statements;")
        db_port = docker('port', container, '5432').rsplit(':', 1)[1]
        base_env = os.environ | {'PROBE_JDBC_URL': f'jdbc:postgresql://127.0.0.1:{db_port}/postgres',
            'SPRING_DATASOURCE_URL': f'jdbc:postgresql://127.0.0.1:{db_port}/postgres',
            'PROBE_DB_USERNAME': 'forena_probe_runtime', 'PROBE_DB_PASSWORD': 'local-probe-only', 'PROBE_TOKEN': TOKEN, 'PROBE_WORKER_TOKEN': WORKER,
            'PROBE_ALLOW_CRASH': 'false', 'PROBE_MIGRATE': 'false',
            'SPRING_APPLICATION_JSON': json.dumps({'probe.worker.budget': 'PT8S', 'probe.worker.reserve': 'PT0.1S',
                'probe.worker.max-publications': 64 if args.recovery_cadence else 2})}
        with tempfile.TemporaryDirectory(prefix='forena-capacity-') as directory:
            log = open(Path(directory) / 'jvm.log', 'w')
            try:
                subprocess.run([JAVA, '-jar', str(JAR)], env=base_env | {'PROBE_MIGRATE': 'true',
                    'PROBE_MIGRATION_USERNAME': 'postgres', 'PROBE_MIGRATION_PASSWORD': 'local-capacity-admin'},
                    stdout=log, stderr=subprocess.STDOUT, timeout=60, check=True)
                ports = []
                for i in range(2):
                    with socket.socket() as available:
                        available.bind(('127.0.0.1', 0))
                        port = available.getsockname()[1]
                    ports.append(port)
                    p = subprocess.Popen([JAVA, '-jar', str(JAR)], env=base_env | {'PORT': str(port),
                        'PROBE_JDBC_URL': base_env['PROBE_JDBC_URL'] + f'?ApplicationName=forena-capacity-{i+1}',
                        'SPRING_DATASOURCE_URL': base_env['PROBE_JDBC_URL'] + f'?ApplicationName=forena-capacity-{i+1}'},
                        stdout=log, stderr=subprocess.STDOUT)
                    processes.append(p)
                    for _ in range(300):
                        if p.poll() is not None: raise RuntimeError('JVM startup failed')
                        try:
                            if request(port, '/actuator/health')[0] == 200: break
                        except OSError: time.sleep(.1)
                    else: raise TimeoutError('JVM readiness')
                source = (ROOT / 'backend/src/main/kotlin/se/forena/probe/delivery/internal/PendingPublications.kt').read_text()
                selection = re.search(r'fun oldest.*?jdbc.sql\("""(.*?)"""', source, re.S)[1]
                selection = selection.replace(':age', '120000').replace(':limit', '2').replace(':after_id', 'null').replace(':after_date', 'null')
                if not args.recovery_cadence:
                    for size in ([1000, 10000] if args.quick else [1000, 10000, 100000]):
                        clear()
                        seed(size, mixed=True)
                        sql('analyze forena_probe.event_publication;')
                        plans = [json_sql('set search_path=forena_probe,public; explain(analyze,buffers,format json) ' + selection)[0]
                                 for _ in range(5)]
                        observations['queryPlans'].append({'backlog': size, 'representativePlan': plans[-1],
                            'executionTimesMs': [p['Execution Time'] for p in plans],
                            'executionP95Ms': percentile([p['Execution Time'] for p in plans])})
                    for instances, delay, count in [(1, 0, 16 if args.quick else 40), (2, 0, 16 if args.quick else 40), (2, 1500, 4)]:
                        clear()
                        seed(count, delay)
                        seed(10000, fresh=True, mixed=True)
                        sql('select pg_stat_statements_reset();')
                        initial_state = counts()
                        calls, started = [], time.monotonic()
                        def drain(index):
                            for _ in range(200):
                                if time.monotonic() - started > 45:
                                    raise TimeoutError('Drain wall-clock budget')
                                status, body, elapsed = request(ports[index], '/api/probes/worker', {}, worker=True)
                                calls.append({'status': status, 'ms': elapsed,
                                              'completed': len(body['completed']) if status == 200 else 0})
                                if counts()['pending'] == 0: return
                                time.sleep(.02)
                            raise TimeoutError('Drain iteration bound')
                        def drain_all():
                            with concurrent.futures.ThreadPoolExecutor(max_workers=instances) as pool:
                                list(pool.map(drain, range(instances)))
                        _, resources = measured(drain_all)
                        elapsed = time.monotonic() - started
                        state = counts()
                        assert state['effects'] == count and state['pending'] == 0, state
                        assert all(c['status'] == 200 for c in calls)
                        stats = json_sql("select coalesce(json_agg(t),'[]') from (select calls,rows,total_exec_time,query from pg_stat_statements where query ilike '%event_publication%' and query not ilike '%pg_stat_statements%')t")
                        observations['delivery'].append({'instances': instances, 'delayMs': delay, 'events': count,
                            'seconds': elapsed, 'effectsPerSecond': count / elapsed, 'httpP95Ms': percentile([c['ms'] for c in calls]),
                            'httpMinMs': min(c['ms'] for c in calls), 'httpMaxMs': max(c['ms'] for c in calls),
                            'workerCalls': len(calls), 'initialState': initial_state, 'state': state, 'resources': resources, 'sqlStats': stats})
                    clear()
                    seed(1)
                    blocked = lock_for('lock table forena_probe.event_publication in access exclusive mode', 4)
                    status, _, elapsed = request(ports[0], '/api/probes/worker', {}, worker=True)
                    assert status == 500 and elapsed < 5000, (status, elapsed)
                    blocked.wait(timeout=10)
                    assert request(ports[0], '/api/probes/worker', {}, worker=True)[0] == 200
                    assert counts()['effects'] == 1 and counts()['pending'] == 0
                    observations['faults'].append({'case': 'blocked-registry-read', 'status': status, 'ms': elapsed, 'retry': counts()})
                    clear()
                    shared_id = str(uuid.uuid4())
                    blocked = lock_for(f"select pg_advisory_xact_lock(hashtextextended('{shared_id}',0))", 15)
                    gate = threading.Barrier(8)
                    def submit(_):
                        gate.wait(timeout=10)
                        return request(ports[0], '/api/probes', {'id': shared_id, 'delayMs': 0, 'mode': 'NORMAL'})
                    def saturate():
                        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
                            return list(pool.map(submit, range(8)))
                    saturated, resources = measured(saturate)
                    blocked.wait(timeout=5)
                    statuses = [r[0] for r in saturated]
                    assert 500 in statuses and 202 in statuses, statuses
                    assert resources['peakConnections']['jvm1'] == 4, resources
                    for _ in range(100):
                        if counts()['effects'] == 1 and counts()['pending'] == 0: break
                        time.sleep(.1)
                    assert counts()['effects'] == 1 and counts()['pending'] == 0
                    assert request(ports[0], '/api/probes', {'id': shared_id, 'delayMs': 0, 'mode': 'NORMAL'})[0] == 202
                    observations['faults'].append({'case': 'eight-writers-one-locked-key', 'statuses': statuses,
                        'httpP95Ms': percentile([r[2] for r in saturated]), 'resources': resources, 'retry': counts()})
                    clear()
                    seed(1, 9000)
                    status, body, elapsed = request(ports[0], '/api/probes/worker', {}, worker=True)
                    assert status == 200 and len(body['deferred']) == 1 and counts()['attempts'] == 0
                    observations['faults'].append({'case': 'listener-above-budget', 'status': status, 'ms': elapsed, 'result': body})
                    clear()
                else:
                    clear()
                    seed(300, delay=9000, age_seconds=121) # Eligible just after the 120s stale threshold.
                    seed(100, age_seconds=121)
                    seed(10000, fresh=True, mixed=True)
                    sql('select pg_stat_statements_reset();')
                    tick_seconds = 2 if args.quick else 60
                    ticks = [{'tick': 0, 'missed': True, 'atSeconds': 0}]
                    started = time.monotonic()
                    def valid_state():
                        return json_sql("""select json_build_object(
                            'pendingValid',(select count(*) from forena_probe.event_publication
                                where completion_date is null and publication_date<clock_timestamp()
                                and serialized_event::jsonb->>'delayMs'='0'),
                            'effects',(select count(*) from forena_probe.probe_effect),
                            'attempts',(select count(*) from forena_probe.probe_attempt),
                            'oldestValidPendingAgeSeconds',(select coalesce(max(extract(epoch from clock_timestamp()-publication_date)),0)
                                from forena_probe.event_publication where completion_date is null
                                and publication_date<clock_timestamp() and serialized_event::jsonb->>'delayMs'='0'),
                            'oldestDeferredPendingAgeSeconds',(select coalesce(max(extract(epoch from clock_timestamp()-publication_date)),0)
                                from forena_probe.event_publication where completion_date is null
                                and serialized_event::jsonb->>'delayMs'='9000'),
                            'deferredAttempts',(select count(*) from forena_probe.probe_attempt a
                                join forena_probe.probe_run r on r.id=a.run_id where r.delay_ms=9000))
                        """)
                    initial_state = valid_state()
                    def run_ticks():
                        # Real minute cadence locally; explicitly scaled 2-second cadence in --quick CI.
                        for tick in range(1, 5):
                            while time.monotonic() < started + tick * tick_seconds:
                                time.sleep(max(0, min(.2, started + tick * tick_seconds - time.monotonic())))
                            port_index = (tick - 1) % 2
                            at = time.monotonic() - started
                            status, body, elapsed = request(ports[port_index], '/api/probes/worker', {}, worker=True)
                            assert status == 200, status
                            ticks.append({'tick': tick, 'atSeconds': at, 'jvm': port_index + 1, 'httpMs': elapsed,
                                'selected': len(body['selected']), 'completed': len(body['completed']),
                                'deferred': len(body['deferred']), 'examined': body['examined'],
                                'stopReason': body['stopReason'], 'state': valid_state()})
                            print(json.dumps({'cadenceTick': ticks[-1]}), flush=True)
                            if valid_state()['pendingValid'] == 0: return
                        raise AssertionError('Recovery target not met in four scheduled invocations')
                    _, resources = measured(run_ticks)
                    elapsed = time.monotonic() - started
                    final = valid_state()
                    assert final['effects'] == 100 and final['pendingValid'] == 0 and final['deferredAttempts'] == 0, final
                    assert elapsed < (5 * 60 if not args.quick else 40), elapsed
                    if not args.quick:
                        # Includes time already spent eligible before the first (missed) tick.
                        assert initial_state['oldestValidPendingAgeSeconds'] - 120 + elapsed < 300
                    stats = json_sql("select coalesce(json_agg(t),'[]') from (select calls,rows,total_exec_time,query from pg_stat_statements where query ilike '%event_publication%' and query not ilike '%pg_stat_statements%')t")
                    observations['cadence'] = {'tickSeconds': tick_seconds, 'realMinuteCadence': not args.quick,
                        'initialState': initial_state, 'events': 100, 'deferredPrefix': 300, 'freshBacklog': 10000, 'ticks': ticks,
                        'secondsToComplete': elapsed, 'resources': resources, 'state': final, 'sqlStats': stats}
                    clear()
                observations['jarSha256'] = hashlib.sha256(JAR.read_bytes()).hexdigest()
                observations['runtimeSourceSha256'] = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in sorted((ROOT / 'backend/src/main').rglob('*')) if p.is_file()}
                observations['checkedAtUtc'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                args.out.parent.mkdir(parents=True, exist_ok=True)
                args.out.write_text(json.dumps(observations, indent=2) + '\n')
                print(json.dumps({'out': str(args.out), 'deliveryCases': len(observations['delivery']),
                                  'querySizes': [p['backlog'] for p in observations['queryPlans']], 'faultCases': len(observations['faults'])}), flush=True)
            except Exception:
                log.flush()
                # Only application logs with local dummy credentials, retained outside the repository.
                Path('/tmp/forena-capacity-failure.log').write_bytes((Path(directory) / 'jvm.log').read_bytes())
                raise
            finally: log.close()
    finally:
        for proc in blockers:
            if proc.poll() is None: proc.terminate()
            try: proc.wait(timeout=5)
            except subprocess.TimeoutExpired: proc.kill(); proc.wait()
        for proc in processes:
            if proc.poll() is None: proc.terminate()
            try: proc.wait(timeout=10)
            except subprocess.TimeoutExpired: proc.kill(); proc.wait()
        if container: docker('rm', '-f', container)


if __name__ == '__main__':
    main()
