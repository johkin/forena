-- Access rules are enforced by Kotlin services (ADR-012).
-- Keep prior change sets immutable so existing local/pilot installations can upgrade.
DO $$
DECLARE rule record; relation text; client_role text;
BEGIN
 FOR rule IN SELECT tablename, policyname FROM pg_policies WHERE schemaname='forena' LOOP
  EXECUTE format('DROP POLICY %I ON forena.%I', rule.policyname, rule.tablename);
 END LOOP;
 FOREACH relation IN ARRAY ARRAY['account','organization','person','person_access','revoked_session',
  'team','activity','invitation','invitation_history','activity_signal_state'] LOOP
  EXECUTE format('ALTER TABLE forena.%I NO FORCE ROW LEVEL SECURITY', relation);
  EXECUTE format('ALTER TABLE forena.%I DISABLE ROW LEVEL SECURITY', relation);
 END LOOP;
 -- A private schema is never a client Data API surface, even on hosts with default grants.
 REVOKE ALL ON ALL TABLES IN SCHEMA forena FROM PUBLIC;
 FOR client_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON SCHEMA forena FROM %I', client_role);
  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA forena FROM %I', client_role);
 END LOOP;
END $$;
DROP FUNCTION forena.can_act_for(uuid,uuid);

-- Existing runtime column grants and integrity/audit triggers remain unchanged.
