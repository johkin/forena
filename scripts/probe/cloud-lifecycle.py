#!/usr/bin/env python3
"""Run only against the isolated forena-kotlin deployment and database.
Install psycopg[binary] in a disposable client. Credentials come from environment.
No application status polling: PostgreSQL is observed directly after each response.
"""
import json
import http.cookiejar
import os
import ssl
import time
import urllib.request
import urllib.error
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse
import psycopg

BASE = os.environ['PROBE_BASE_URL'].rstrip('/')
parsed = urlparse(BASE)
if parsed.scheme != 'https' or not parsed.hostname.startswith('forena-kotlin-') or not parsed.hostname.endswith('.vercel.app'):
    raise SystemExit('Expected the isolated forena-kotlin deployment URL')
if os.environ.get('PROBE_PROJECT_REF') != 'ckzrtxqjskosqzoitymc':
    raise SystemExit('Wrong Supabase test project')
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
if os.environ.get('PROBE_ACCESS_URL'):
    with opener.open(os.environ['PROBE_ACCESS_URL'], timeout=120) as access:
        access.read()
headers = {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + os.environ['PROBE_TOKEN']}
if os.environ.get('PROBE_BYPASS'):
    headers['x-vercel-protection-bypass'] = os.environ['PROBE_BYPASS']


def post(path, body):
    started = time.monotonic()
    request = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), headers=headers, method='POST')
    with opener.open(request, timeout=120) as response:
        data = json.loads(response.read())  # timestamp only after the entire response body arrived
        received = datetime.now(timezone.utc).isoformat()
        return response.status, data, received, round((time.monotonic() - started) * 1000)

with psycopg.connect(host=os.environ['PROBE_PGHOST'], port=5432, dbname='postgres',
    user=os.environ['PROBE_PGUSER'], password=os.environ['PROBE_DB_PASSWORD'],
    sslmode='verify-full', sslrootcert=os.environ['PROBE_SSL_ROOT_CERT'],
    autocommit=True, connect_timeout=10) as db:
    def rows(query, args=()):
        with db.cursor() as cur:
            cur.execute(query, args)
            return cur.fetchall()
    assert rows("select rolsuper or rolbypassrls from pg_roles where rolname=current_user")[0][0] is False
    # The pooler terminates client TLS; pg_stat_ssl describes its backend leg, not this connection.
    assert db.pgconn.ssl_in_use is True
    report = {'deployment': BASE, 'tests': []}
    for delay in [10000, 60000]:
        run_id = str(uuid.uuid4())
        status, _, received, elapsed = post('/api/probes', {'id': run_id, 'delayMs': delay, 'mode': 'NORMAL'})
        assert status == 202
        rows('insert into forena_probe.probe_receipt(id) values (%s) returning id', (run_id,))
        deadline = time.monotonic() + delay / 1000 + 30
        completed = []
        while time.monotonic() < deadline:
            completed = rows('select e.completed_at > r.received_at, e.completed_at, e.instance_id from forena_probe.probe_effect e join forena_probe.probe_receipt r using(id) where id=%s', (run_id,))
            if completed: break
            time.sleep(1)
        report['tests'].append({'id': run_id, 'delayMs': delay, 'responseReceivedAt': received, 'responseMs': elapsed,
            'completedAfterResponse': bool(completed and completed[0][0]), 'completedAt': str(completed[0][1]) if completed else None,
            'instanceId': completed[0][2] if completed else None})
        # A failure is recorded, not converted into success by calling the API to wake the process.
        print(json.dumps(report['tests'][-1]), flush=True)
    if os.environ.get('PROBE_TEST_CRASH') == 'true':
        run_id = str(uuid.uuid4())
        status, _, received, elapsed = post('/api/probes', {'id': run_id, 'delayMs': 10000, 'mode': 'CRASH'})
        assert status == 202
        time.sleep(20)
        before = rows('select count(*) from forena_probe.probe_effect where id=%s', (run_id,))[0][0]
        pending = rows('select count(*) from forena_probe.event_publication where serialized_event like %s and completion_date is null', ('%' + run_id + '%',))[0][0]
        status, _, _, recovery_ms = post(f'/api/probes/{run_id}/recover', {})
        assert status == 200
        assert post(f'/api/probes/{run_id}/recover', {})[0] == 200
        after = rows('select count(*) from forena_probe.probe_effect where id=%s', (run_id,))[0][0]
        boots = rows('select count(distinct instance_id) from forena_probe.probe_attempt where run_id=%s', (run_id,))[0][0]
        item = {'id': run_id, 'responseReceivedAt': received, 'responseMs': elapsed, 'pendingBeforeRecovery': pending,
            'effectsBeforeRecovery': before, 'effectsAfterRepeatedRecovery': after, 'distinctInstances': boots, 'recoveryMs': recovery_ms}
        report['tests'].append(item)
        print(json.dumps(item), flush=True)
        assert before == 0 and pending == 1 and after == 1 and boots == 2
    print(json.dumps({'result': report}, default=str), flush=True)
