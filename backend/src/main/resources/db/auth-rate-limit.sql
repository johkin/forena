-- Private admission state. No raw IP/email and no provider credentials.
CREATE TABLE forena.auth_rate_limit (
 key_hash text PRIMARY KEY CHECK (key_hash ~ '^[A-Za-z0-9_-]{43}$'),
 available_at timestamptz NOT NULL
);
CREATE INDEX auth_rate_limit_expiry ON forena.auth_rate_limit(available_at);
REVOKE ALL ON forena.auth_rate_limit FROM PUBLIC;
DO $$
DECLARE client_role text;
BEGIN
 FOR client_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON forena.auth_rate_limit FROM %I', client_role);
 END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON forena.auth_rate_limit TO forena_api_runtime;
