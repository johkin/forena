-- ONLY forena-kotlin, after Liquibase probe-002-faults and scheduler-setup.sql.
-- psql variables: before_id, after_id, last_response_at (full seed response).
-- Provision the three temporary Vault entries from scheduler-activate.sql first.
-- All SQL accounts must be trusted to see pg_net's queued headers (M22B).
BEGIN;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='forena-kotlin-m22') OR
     EXISTS(SELECT 1 FROM forena_probe_scheduler.settings) OR
     EXISTS(SELECT 1 FROM forena_probe_scheduler.calls) OR
     EXISTS(SELECT 1 FROM forena_probe.probe_fault) OR
     (SELECT count(*) FROM vault.secrets WHERE name IN
       ('forena_kotlin_m22_worker_url','forena_kotlin_m22_worker_token','forena_kotlin_m22_worker_headers')) <> 3
  THEN RAISE EXCEPTION 'Unexpected previous test state or missing credentials'; END IF;
END $$;
INSERT INTO forena_probe.probe_fault(id,point)
SELECT id,'BEFORE_EFFECT' FROM forena_probe.probe_run WHERE id=:'before_id'::uuid AND mode='BLOCK'
UNION ALL
SELECT id,'AFTER_EFFECT_COMMIT' FROM forena_probe.probe_run WHERE id=:'after_id'::uuid AND mode='BLOCK';
DO $$ BEGIN
  IF (SELECT count(*) FROM forena_probe.probe_fault) <> 2 THEN
    RAISE EXCEPTION 'Expected two distinct existing BLOCK probes';
  END IF;
END $$;
INSERT INTO forena_probe_scheduler.settings(singleton,not_before,expires_at,max_calls,first_timeout_ms)
VALUES(true,greatest(clock_timestamp()+interval '60 seconds',
  :'last_response_at'::timestamptz+interval '150 seconds'),
  clock_timestamp()+interval '15 minutes',10,180000);
-- One HTTP request per minute until both one-shot faults have been consumed.
-- Then two requests in the same committed Cron transaction, to overlap workers.
-- invoke_worker enforces expiry/max_calls and unschedules this fixed job name.
SELECT cron.schedule('forena-kotlin-m22','* * * * *',$job$
  SELECT forena_probe_scheduler.invoke_worker();
  SELECT forena_probe_scheduler.invoke_worker()
    WHERE (SELECT count(*)=2 AND bool_and(consumed_at IS NOT NULL) FROM forena_probe.probe_fault);
$job$);
COMMIT;
