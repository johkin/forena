-- Private infrastructure state, never part of business history or the client Data API.
CREATE TABLE forena.browser_session (
 id_hash text PRIMARY KEY CHECK (id_hash ~ '^[0-9a-f]{64}$'),
 subject uuid NOT NULL REFERENCES forena.account(subject) ON DELETE CASCADE,
 provider_session uuid NOT NULL,
 tokens text NOT NULL,
 access_expires_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 idle_expires_at timestamptz NOT NULL
);
CREATE INDEX browser_session_expiry ON forena.browser_session(expires_at);
CREATE INDEX browser_session_idle_expiry ON forena.browser_session(idle_expires_at);
REVOKE ALL ON forena.browser_session FROM PUBLIC;
DO $$
DECLARE client_role text;
BEGIN
 FOR client_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON forena.browser_session FROM %I', client_role);
 END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON forena.browser_session TO forena_api_runtime;
