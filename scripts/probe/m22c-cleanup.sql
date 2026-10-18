-- ONLY forena-kotlin (ckzrtxqjskosqzoitymc), the recorded 2026-10-18 M22C run.
-- Inspect project ID in the Dashboard before running. The Cron job is already
-- absent and these Vault values were neutralized with vault.update_secret.
-- Remove only this run's recorded rows; keep synthetic effects/publications.
BEGIN;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM forena_probe_scheduler.settings
      WHERE expires_at<>'2026-10-18T19:02:57.424706+00:00'::timestamptz) OR
     EXISTS(SELECT 1 FROM vault.decrypted_secrets
       WHERE name IN ('forena_kotlin_m22_worker_url','forena_kotlin_m22_worker_token','forena_kotlin_m22_worker_headers')
         AND decrypted_secret<>'revoked-m22c-cleanup')
  THEN RAISE EXCEPTION 'State changed since M22C; inspect instead of deleting'; END IF;
END $$;
DELETE FROM vault.secrets WHERE name IN (
  'forena_kotlin_m22_worker_url','forena_kotlin_m22_worker_token','forena_kotlin_m22_worker_headers'
);
DELETE FROM net.http_request_queue WHERE id IN (25,26,27,28,29,30,31,32,33,34);
DELETE FROM net._http_response WHERE id IN (25,26,27,28,29,30,31,32,33,34);
DELETE FROM forena_probe.probe_fault WHERE id IN (
  '145e727b-69c0-401f-a7fa-6fdfdcb9e9e0','7c402fdb-7cf2-4f7d-af72-a6bd8fbcd93d'
);
DELETE FROM forena_probe_scheduler.calls WHERE request_id IN (25,26,27,28,29,30,31,32,33,34);
DELETE FROM forena_probe_scheduler.settings
  WHERE singleton AND expires_at='2026-10-18T19:02:57.424706+00:00'::timestamptz;
COMMIT;
SELECT
  (SELECT count(*) FROM vault.secrets WHERE name LIKE 'forena_kotlin_m22_worker_%') AS vault_entries,
  (SELECT count(*) FROM forena_probe.probe_fault) AS fault_rows,
  (SELECT count(*) FROM forena_probe_scheduler.calls) AS calls,
  (SELECT count(*) FROM forena_probe_scheduler.settings) AS settings,
  (SELECT count(*) FROM net._http_response WHERE id IN (25,26,27,28,29,30,31,32,33,34)) AS responses;
