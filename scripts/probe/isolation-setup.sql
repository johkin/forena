-- ONLY forena-kotlin (ckzrtxqjskosqzoitymc), M22B provider/test fixture.
-- Snapshot authenticator's role/database settings before running. This version
-- requires NO existing db_schemas override; cleanup restores that exact state.
DO $$ BEGIN
  IF to_regnamespace('forena_probe_api_check') IS NOT NULL OR EXISTS (
    SELECT 1 FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole
    WHERE r.rolname='authenticator' AND EXISTS (
      SELECT 1 FROM unnest(s.setconfig) setting WHERE setting LIKE 'pgrst.db_schemas=%'
    )
  ) THEN RAISE EXCEPTION 'Unexpected fixture or API override; inspect before proceeding'; END IF;
END $$;
CREATE SCHEMA forena_probe_api_check;
REVOKE ALL ON SCHEMA forena_probe_api_check FROM PUBLIC;
CREATE TABLE forena_probe_api_check.canary (
  id integer PRIMARY KEY CHECK (id=1), marker text NOT NULL
);
INSERT INTO forena_probe_api_check.canary VALUES (1,'m22b-synthetic-control');
ALTER TABLE forena_probe_api_check.canary ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON forena_probe_api_check.canary FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA forena_probe_api_check TO anon, authenticated;
GRANT SELECT ON forena_probe_api_check.canary TO anon, authenticated;
CREATE POLICY synthetic_control ON forena_probe_api_check.canary FOR SELECT
  TO anon, authenticated USING (id=1);
-- Temporarily expose ONLY the synthetic fixture. Never expose net or business data.
ALTER ROLE authenticator SET pgrst.db_schemas = 'forena_probe_api_check';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
