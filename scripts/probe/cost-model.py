#!/usr/bin/env python3
"""Dated M22E planning arithmetic, USD ex VAT. Assumptions are not observed bills."""
import argparse
import json
from pathlib import Path

RATES = {
    'checkedAt': '2026-10-18',
    'vercelFra1CpuHour': .184, 'vercelFra1GbHour': .0152, 'vercelMillionInvocations': .60,
    'vercelProTeam': 20, 'vercelUsageCredit': 20, 'supabaseProOrg': 25,
    'supabaseMicroHour': .01344, 'supabaseComputeCredit': 10,
    'cloudRunTier1VcpuSecond': .000024, 'cloudRunTier1GibSecond': .0000025,
    'cloudRunMillionRequests': .40, 'schedulerJob': .10,
    'sources': [
        'https://vercel.com/docs/functions/usage-and-pricing',
        'https://vercel.com/docs/plans/pro-plan',
        'https://supabase.com/docs/guides/platform/manage-your-usage/compute',
        'https://cloud.google.com/run/pricing',
        'https://cloud.google.com/run/docs/locations',
        'https://cloud.google.com/scheduler/pricing']
}


def calculate(api_requests, api_cpu_ms, api_wall_ms, scheduler_days, scheduler_wall_ms, scheduler_cpu_ms, listener_seconds=0):
    # Sum instance-active wall seconds conservatively, without a concurrency discount.
    ticks = scheduler_days * 24 * 60
    requests = api_requests + ticks
    cpu_seconds = api_requests * api_cpu_ms / 1000 + ticks * scheduler_cpu_ms / 1000
    wall_seconds = api_requests * api_wall_ms / 1000 + ticks * scheduler_wall_ms / 1000 + listener_seconds
    v_cpu = cpu_seconds / 3600 * RATES['vercelFra1CpuHour']
    v_memory = 2 * wall_seconds / 3600 * RATES['vercelFra1GbHour']
    v_requests = requests / 1e6 * RATES['vercelMillionInvocations']
    cr_cpu = wall_seconds * RATES['cloudRunTier1VcpuSecond']
    cr_memory = wall_seconds * 2 * RATES['cloudRunTier1GibSecond']
    cr_requests = requests / 1e6 * RATES['cloudRunMillionRequests']
    return {'assumptions': {'apiRequests': api_requests, 'apiCpuMs': api_cpu_ms, 'apiWallMs': api_wall_ms,
        'schedulerDays': scheduler_days, 'schedulerWallMs': scheduler_wall_ms, 'schedulerCpuMs': scheduler_cpu_ms,
        'listenerWaitSeconds': listener_seconds, 'memoryGbOrGib': 2, 'vcpus': 1},
        'monthlyInvocations': requests, 'schedulerInvocations': ticks, 'cpuSeconds': cpu_seconds,
        'instanceActiveSecondsUpperEstimate': wall_seconds,
        'vercelGross': {'cpu': v_cpu, 'memory': v_memory, 'invocations': v_requests,
                        'total': v_cpu + v_memory + v_requests},
        'cloudRunTier1GrossBeforeFreeTier': {'cpu': cr_cpu, 'memory': cr_memory, 'requests': cr_requests,
                                            'total': cr_cpu + cr_memory + cr_requests}}


def model():
    scenarios = {
        'devRemoteIfUsed': calculate(10000, 100, 200, 0, 200, 10),
        'testControlled': calculate(20000, 100, 200, 2, 200, 10),
        'oneClubProduction': calculate(100000, 100, 200, 30, 200, 10),
        'tenfoldTraffic': calculate(1000000, 100, 200, 30, 200, 10),
        'coldControlledTestSensitivity': calculate(20000, 100, 200, 2, 15000, 4000),
        'coldEverySchedulerTickSensitivity': calculate(100000, 100, 200, 30, 15000, 4000),
        'sixtySecondListenerEveryMinuteSensitivity': calculate(100000, 100, 200, 30, 200, 10, 43200 * 60)
    }
    compute_one = 730 * RATES['supabaseMicroHour']
    db_one = RATES['supabaseProOrg'] + max(0, compute_one - RATES['supabaseComputeCredit'])
    db_two = RATES['supabaseProOrg'] + max(0, 2 * compute_one - RATES['supabaseComputeCredit'])
    function_usage = sum(scenarios[s]['vercelGross']['total'] for s in
                         ['devRemoteIfUsed', 'testControlled', 'oneClubProduction'])
    return {'rates': RATES, 'scenarios': scenarios,
        'sharedBilling': {'supabaseOneMicroOrg': db_one, 'supabaseTwoMicrosOrg': db_two,
            'supabaseSecondMicroIncrement': db_two - db_one,
            'vercelProTeamOneDeployingSeat': 20,
            'vercelAllThreeFunctionUsage': function_usage,
            'hobbyAllThreeCpuHoursAssumed': sum(scenarios[s]['cpuSeconds'] for s in
                ['devRemoteIfUsed', 'testControlled', 'oneClubProduction']) / 3600,
            'vercelAllThreeAfterSharedCredit': 20 + max(0, function_usage - 20),
            'hobbyPlusSupabaseCronCoreIfEligible': db_one,
            'hobbyWithLocalDevAndPaidTestIfEligible': db_two,
            'oneClubCoreVercelProPlusSupabase': db_one + 20,
            'coreWithLocalDevAndAlwaysOnPaidTest': db_two + 20},
        'exclusions': ['No actual account invoice or resource usage was retrieved.',
            'AI, email, domain, taxes, optional PITR, additional seats and integrations are excluded.',
            'Allow separate storage/network/build/log budgets; see accompanying report.',
            'Cloud Run numbers use nearby Belgium Tier 1; Frankfurt is Tier 2 and needs its own quote.',
            'Vercel usage credit and Supabase compute credit each apply once per team/organization.',
            'Cloud Run free tier is shared per billing account and is not deducted here.',
            'GB and GiB are provider units; this model budgets the configured 2-unit memory size for each.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(model(), indent=2) + '\n')
