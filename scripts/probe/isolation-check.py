#!/usr/bin/env python3
"""M22B: verify schema rejection alongside a successful synthetic Data API read.

Only for the isolated forena-kotlin project. Never prints keys, headers or raw
error bodies. --verify-evidence also accepts sanitized pg_net observations.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

BASE = 'https://ckzrtxqjskosqzoitymc.supabase.co/rest/v1'
FIXTURE = 'forena_probe_api_check'
CANARY = [{'id': 1, 'marker': 'm22b-synthetic-control'}]


def cases():
    checks = [dict(name='control-read', method='GET', schema=FIXTURE,
                   path='/canary?select=id,marker', expected=200, code=None),
              dict(name='control-write-denied', method='POST', schema=FIXTURE,
                   path='/canary', expected=401, code='42501')]
    for schema in ['net', 'forena_probe', 'forena_probe_scheduler', 'vault', 'auth']:
        for method in ['GET', 'POST']:
            checks.append(dict(name=f'{schema}-{method}', method=method, schema=schema,
                               path='/http_request_queue?select=id&limit=0' if method == 'GET' else '/canary',
                               expected=406, code='PGRST106'))
    checks.append(dict(name='scheduler-rpc', method='POST', schema='forena_probe_scheduler',
                       path='/rpc/invoke_worker', expected=406, code='PGRST106'))
    return checks


def verify(observations):
    expected = cases()
    if len(observations) != len(expected):
        raise ValueError('Incomplete observation set')
    for case, observed in zip(expected, observations):
        if (observed.get('name'), observed.get('status'), observed.get('code')) != (
                case['name'], case['expected'], case['code']):
            raise ValueError('Unexpected result for ' + case['name'])
        if case['name'] == 'control-read' and observed.get('body') != CANARY:
            raise ValueError('Positive control did not return the synthetic row')
    return dict(passed=True, cases=len(expected), authenticatedHttpTested=False)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Never forward the key to a redirect target.


def request_all(key):
    if not key.startswith('sb_publishable_'):
        raise ValueError('Use the isolated project publishable key')
    opener = urllib.request.build_opener(NoRedirect())
    observations = []
    for case in cases():
        profile = 'Accept-Profile' if case['method'] == 'GET' else 'Content-Profile'
        # Private-schema POSTs use an empty batch (no writes if unexpectedly exposed).
        payload = None if case['method'] == 'GET' else (
            b'{}' if case['name'] == 'scheduler-rpc' else
            b'{"id":1,"marker":"must-not-write"}' if case['name'] == 'control-write-denied' else b'[]')
        request = urllib.request.Request(BASE + case['path'], data=payload,
            headers={'apikey': key, profile: case['schema'], 'Content-Type': 'application/json'},
            method=case['method'])
        try:
            response = opener.open(request, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            status = response.code
            try:
                body = json.loads(response.read(65536))
            except (ValueError, UnicodeDecodeError):
                body = None
        # Retain only known error codes and the exact synthetic positive control.
        code = body.get('code') if isinstance(body, dict) else None
        if code not in ['42501', 'PGRST106', 'PGRST002']:
            code = None
        observed = dict(name=case['name'], status=status, code=code)
        if case['name'] == 'control-read' and body == CANARY:
            observed['body'] = body
        observations.append(observed)
    return observations


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-evidence', help='Verify sanitized observations from a controlled transport')
    args = parser.parse_args()
    if args.verify_evidence:
        with open(args.verify_evidence) as file:
            observations = json.load(file)['observations']
    else:
        observations = request_all(os.environ['PROBE_PUBLISHABLE_KEY'])
    result = verify(observations)  # A 503 is never accepted as schema isolation.
    print(json.dumps(dict(checkedAt=datetime.now(timezone.utc).isoformat(),
                         result=result, observations=observations)))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, urllib.error.URLError) as error:
        # Do not echo arbitrary exception details containing transport credentials.
        print(json.dumps({'passed': False, 'errorType': type(error).__name__}), file=sys.stderr)
        sys.exit(1)
