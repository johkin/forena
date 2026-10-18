#!/usr/bin/env python3
"""Isolated M22 client: recover long-lived publications under an active request."""
import http.cookiejar
import json
import os
import time
import urllib.request
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

import psycopg

base = os.environ['PROBE_BASE_URL'].rstrip('/')
host = urlparse(base)
if host.scheme != 'https' or not host.hostname.startswith('forena-kotlin-') or not host.hostname.endswith('.vercel.app'):
    raise SystemExit('Expected the isolated forena-kotlin preview')
if os.environ['PROBE_PROJECT_REF'] != 'ckzrtxqjskosqzoitymc':
    raise SystemExit('Wrong Supabase test project')
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
with opener.open(os.environ['PROBE_ACCESS_URL'], timeout=120) as response:
    response.read()


def post(path, body):
    started = time.monotonic()
    request = urllib.request.Request(base + path, data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + os.environ['PROBE_TOKEN']}, method='POST')
    with opener.open(request, timeout=120) as response:
        value = json.loads(response.read())
        return {'status': response.status, 'body': value,
            'responseReceivedAt': datetime.now(timezone.utc).isoformat(),
            'requestMs': round((time.monotonic() - started) * 1000)}


with psycopg.connect(host=os.environ['PROBE_PGHOST'], port=5432, dbname='postgres',
    user=os.environ['PROBE_PGUSER'], password=os.environ['PROBE_DB_PASSWORD'],
    sslmode='verify-full', sslrootcert=os.environ['PROBE_SSL_ROOT_CERT'],
    autocommit=True, connect_timeout=10) as db:
    def rows(query, parameters=()):
        with db.cursor() as cursor:
            cursor.execute(query, parameters)
            return cursor.fetchall()

    assert db.pgconn.ssl_in_use
    assert rows('select rolsuper or rolbypassrls from pg_roles where rolname=current_user')[0][0] is False
    assert rows("select has_schema_privilege(current_user,'forena_probe','CREATE')")[0][0] is False
    assert rows("select has_table_privilege(current_user,'forena_probe.probe_effect','INSERT')")[0][0] is False

    def snapshot(run_id):
        return {
            'effects': rows('select count(*) from forena_probe.probe_effect where id=%s', (run_id,))[0][0],
            'pending': rows('select count(*) from forena_probe.event_publication where serialized_event like %s and completion_date is null', ('%' + run_id + '%',))[0][0],
            'instanceIds': [row[0] for row in rows('select distinct instance_id from forena_probe.probe_attempt where run_id=%s order by instance_id', (run_id,))],
        }

    report = {'deployment': base, 'tests': []}

    def recover(run_id, label):
        before = snapshot(run_id)
        assert before['effects'] == 0 and before['pending'] == 1, before
        first = post('/api/probes/' + run_id + '/recover', {})
        assert first['status'] == 200
        after_first = snapshot(run_id)
        repeated = post('/api/probes/' + run_id + '/recover', {})
        assert repeated['status'] == 200
        after = snapshot(run_id)
        deadline = time.monotonic() + 10
        while after['pending'] and time.monotonic() < deadline:
            time.sleep(.1)
            after = snapshot(run_id)
        assert after_first['effects'] == 1 and after['effects'] == 1 and after['pending'] == 0, after
        result = {'name': label, 'id': run_id, 'before': before, 'firstRecovery': first,
            'afterFirstRecovery': after_first, 'repeatedRecoveryMs': repeated['requestMs'], 'afterRepeatedRecovery': after}
        report['tests'].append(result)
        print(json.dumps(result), flush=True)

    # The original M21 publication remained PROCESSING without an effect for hours.
    if os.environ.get('PROBE_EXISTING_RUN_ID'):
        recover(str(uuid.UUID(os.environ['PROBE_EXISTING_RUN_ID'])), 'existing-stale-publication')

    run_id = str(uuid.uuid4())
    submitted = post('/api/probes', {'id': run_id, 'delayMs': 60000, 'mode': 'BLOCK'})
    assert submitted['status'] == 202
    print(json.dumps({'submitted': run_id, 'responseReceivedAt': submitted['responseReceivedAt'],
        'idleObservationSeconds': 90}), flush=True)
    # No app calls while the preview can scale down. The client sleeps; the app does not stay warm.
    time.sleep(90)
    recover(run_id, '60s-recovery-after-preview-idle')
    assert len(report['tests'][-1]['afterRepeatedRecovery']['instanceIds']) >= 2, 'No evidence of a new JVM'
    print(json.dumps({'result': report}), flush=True)
