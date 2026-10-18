-- ONLY forena-kotlin. No real credential is read or sent.
-- pg_net sends after commit: insert/read/delete all happen within this DO's
-- transaction. An error rolls back the insert; no outbound request can occur.
DO $$
DECLARE request_id bigint; reader text; visible boolean;
BEGIN
  INSERT INTO net.http_request_queue(method,url,headers,body,timeout_milliseconds)
    VALUES ('GET','https://example.invalid/m22b-never-sent',
      '{"X-Forena-Probe":"synthetic-not-a-secret"}'::jsonb,''::bytea,1000)
    RETURNING id INTO request_id;
  -- postgres may SET these built-in roles. Custom runtime/observer memberships
  -- deliberately have SET FALSE; audit their effective ACLs without weakening it.
  FOREACH reader IN ARRAY ARRAY['anon','authenticated'] LOOP
    EXECUTE format('SET LOCAL ROLE %I',reader);
    SELECT headers->>'X-Forena-Probe'='synthetic-not-a-secret' INTO visible
      FROM net.http_request_queue WHERE id=request_id;
    EXECUTE 'RESET ROLE';
    IF visible IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Expected platform queue visibility not reproduced for %',reader;
    END IF;
  END LOOP;
  DELETE FROM net.http_request_queue WHERE id=request_id;
END $$;
SELECT jsonb_build_object('checked_at',clock_timestamp(),
  'synthetic_header_readable_by',jsonb_build_array('anon','authenticated'),
  'committed_outbound_requests',0,
  'interpretation','Reproduces platform limitation, NOT a security pass') AS sql_role_test;
