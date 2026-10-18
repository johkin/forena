#!/usr/bin/env python3
"""Seed synthetic work once; all later traffic must come from the real scheduler."""
import argparse
import http.cookiejar
import json
import os
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

args = argparse.ArgumentParser(description=__doc__)
args.add_argument('--headers-out', help='Optional private scratch file for preview cookie headers; never commit or log it')
options = args.parse_args()
base = os.environ['PROBE_BASE_URL'].rstrip('/')
host = urlparse(base)
if host.scheme != 'https' or not host.hostname.startswith('forena-kotlin-') or not host.hostname.endswith('.vercel.app'):
    raise SystemExit('Expected isolated forena-kotlin preview')
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
with opener.open(os.environ['PROBE_ACCESS_URL'], timeout=120) as response:
    response.read()
if options.headers_out:
    request = urllib.request.Request(base + '/api/probes/worker')
    jar.add_cookie_header(request)
    cookie = request.get_header('Cookie')
    assert cookie, 'No preview access cookie'
    fd = os.open(options.headers_out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as file:
        json.dump({'Cookie': cookie}, file)


def post(path, body, token):
    request = urllib.request.Request(base + path, data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token}, method='POST')
    try:
        with opener.open(request, timeout=120) as response:
            response.read()
            return response.status
    except urllib.error.HTTPError as error:
        # Protection errors can echo credential-bearing callbacks. Never log their body.
        return error.code


if os.environ.get('PROBE_PUBLISHABLE_KEY'):
    request = urllib.request.Request('https://ckzrtxqjskosqzoitymc.supabase.co/rest/v1/http_request_queue?select=id',
        headers={'apikey': os.environ['PROBE_PUBLISHABLE_KEY'], 'Accept-Profile': 'net'})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raise AssertionError('net must not be exposed through the Data API')
    except urllib.error.HTTPError as error:
        data = json.loads(error.read())
        assert error.code == 406 and data.get('code') == 'PGRST106', 'Could not verify Data API isolation'
        print(json.dumps({'dataApiNetAccessible': False, 'status': error.code, 'code': data['code']}), flush=True)

assert post('/api/probes/worker', {}, os.environ['PROBE_TOKEN']) == 403
assert post('/api/probes', {'id': str(uuid.uuid4()), 'delayMs': 0, 'mode': 'BLOCK'},
    os.environ['PROBE_WORKER_TOKEN']) == 403
records = []
for delay in [1000, 60000]:
    run_id = str(uuid.uuid4())
    status = post('/api/probes', {'id': run_id, 'delayMs': delay, 'mode': 'BLOCK'}, os.environ['PROBE_TOKEN'])
    assert status == 202, 'Submission failed'
    records.append({'id': run_id, 'delayMs': delay, 'status': status,
        'responseReceivedAt': datetime.now(timezone.utc).isoformat()})
print(json.dumps({'seeded': records, 'noFurtherAppRequests': True}), flush=True)
