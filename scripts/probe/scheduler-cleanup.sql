-- ONLY the isolated forena-kotlin project. Never print Vault or pg_net headers.
DO $cleanup$
BEGIN
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='forena-kotlin-m22' AND username=current_user) THEN
    PERFORM cron.unschedule('forena-kotlin-m22');
  END IF;
END
$cleanup$;
DELETE FROM vault.secrets WHERE name IN (
  'forena_kotlin_m22_worker_url','forena_kotlin_m22_worker_token','forena_kotlin_m22_worker_headers'
);
DELETE FROM net.http_request_queue WHERE id IN (SELECT request_id FROM forena_probe_scheduler.calls);
-- Response headers can include a protection cookie. Persist only sanitized evidence elsewhere.
DELETE FROM net._http_response WHERE id IN (SELECT request_id FROM forena_probe_scheduler.calls);
TRUNCATE forena_probe_scheduler.calls, forena_probe_scheduler.settings;
ALTER ROLE forena_probe_observer NOLOGIN;
