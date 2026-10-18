-- ONLY isolated forena-kotlin, after scheduler-setup.sql and scheduler-seed.py.
-- Vault contains only temporary preview URL/token/cookie headers; never inline them.
-- The initial one-second timeout is a deliberate transport fault, not normal config.
DO $guard$
BEGIN
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='forena-kotlin-m22') OR
      EXISTS(SELECT 1 FROM forena_probe_scheduler.settings) OR
      EXISTS(SELECT 1 FROM forena_probe_scheduler.calls) THEN
    RAISE EXCEPTION 'Clean up previous test before scheduling again';
  END IF;
  IF (SELECT count(*) FROM vault.secrets WHERE name IN (
      'forena_kotlin_m22_worker_url','forena_kotlin_m22_worker_token','forena_kotlin_m22_worker_headers')) <> 3 THEN
    RAISE EXCEPTION 'Provision all three temporary Vault secrets first';
  END IF;
END
$guard$;
INSERT INTO forena_probe_scheduler.settings(singleton,not_before,expires_at,max_calls,first_timeout_ms)
VALUES(true,clock_timestamp()+interval '150 seconds',clock_timestamp()+interval '12 minutes',5,1000);
SELECT cron.schedule('forena-kotlin-m22','* * * * *','select forena_probe_scheduler.invoke_worker();');
