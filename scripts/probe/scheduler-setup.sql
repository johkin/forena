-- ONLY the isolated Supabase project forena-kotlin (ckzrtxqjskosqzoitymc).
-- Provider/test bootstrap, not an application Liquibase migration.
-- Does not create a schedule or contain secret values.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
-- Platform constraint: supabase_admin owns net; postgres cannot revoke its PUBLIC
-- grants. Every direct SQL login must be trusted to see queued HTTP credentials.
-- Use only short-lived synthetic test credentials and never expose net via Data API.
-- Do not claim a successful REVOKE based only on the absence of SQL errors.
CREATE SCHEMA IF NOT EXISTS forena_probe_scheduler;
REVOKE ALL ON SCHEMA forena_probe_scheduler FROM PUBLIC, anon, authenticated, forena_probe_runtime, forena_probe_observer;

CREATE TABLE IF NOT EXISTS forena_probe_scheduler.settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  not_before timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  max_calls integer NOT NULL CHECK(max_calls BETWEEN 1 AND 10),
  CHECK(expires_at > not_before AND expires_at <= not_before + interval '30 minutes')
);
-- Correlation with pg_net transport responses, not a business outbox or retry queue.
CREATE TABLE IF NOT EXISTS forena_probe_scheduler.calls (
  request_id bigint PRIMARY KEY,
  sent_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Optional one-shot HTTP timeout fault; default is the normal three-minute limit.
ALTER TABLE forena_probe_scheduler.settings ADD COLUMN IF NOT EXISTS first_timeout_ms integer
  NOT NULL DEFAULT 180000 CHECK(first_timeout_ms BETWEEN 1000 AND 180000);
ALTER TABLE forena_probe_scheduler.calls ADD COLUMN IF NOT EXISTS timeout_ms integer NOT NULL DEFAULT 180000;

CREATE OR REPLACE FUNCTION forena_probe_scheduler.invoke_worker()
RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $function$
DECLARE
  config forena_probe_scheduler.settings%ROWTYPE;
  request bigint;
  request_timeout integer;
BEGIN
  SELECT * INTO config FROM forena_probe_scheduler.settings WHERE singleton;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF clock_timestamp() >= config.expires_at OR
      (SELECT count(*) FROM forena_probe_scheduler.calls) >= config.max_calls THEN
    IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='forena-kotlin-m22' AND username=current_user) THEN
      PERFORM cron.unschedule('forena-kotlin-m22');
    END IF;
    RETURN NULL;
  END IF;
  IF clock_timestamp() < config.not_before THEN RETURN NULL; END IF;
  request_timeout := CASE WHEN NOT EXISTS(SELECT 1 FROM forena_probe_scheduler.calls)
    THEN config.first_timeout_ms ELSE 180000 END;
  request := net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='forena_kotlin_m22_worker_url'),
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='forena_kotlin_m22_worker_token')
    ) || (SELECT decrypted_secret::jsonb FROM vault.decrypted_secrets WHERE name='forena_kotlin_m22_worker_headers'),
    body := '{}'::jsonb,
    timeout_milliseconds := request_timeout
  );
  INSERT INTO forena_probe_scheduler.calls(request_id, timeout_ms) VALUES(request, request_timeout);
  RETURN request;
END
$function$;

REVOKE ALL ON ALL TABLES IN SCHEMA forena_probe_scheduler FROM PUBLIC, anon, authenticated, forena_probe_runtime, forena_probe_observer;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA forena_probe_scheduler FROM PUBLIC, anon, authenticated, forena_probe_runtime, forena_probe_observer;
