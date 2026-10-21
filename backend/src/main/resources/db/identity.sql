-- Private, portable business schema. Supabase auth/storage remain provider-owned.
REVOKE ALL ON SCHEMA forena FROM PUBLIC;
GRANT USAGE ON SCHEMA forena TO forena_api_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA forena REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE forena.account (
 subject uuid PRIMARY KEY,
 enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE forena.organization (
 id uuid PRIMARY KEY, name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200)
);
CREATE TABLE forena.person (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES forena.organization,
 display_name text NOT NULL CHECK(length(trim(display_name)) BETWEEN 1 AND 200),
 UNIQUE(id, organization_id)
);
CREATE TABLE forena.person_access (
 person_id uuid NOT NULL, organization_id uuid NOT NULL,
 subject uuid NOT NULL REFERENCES forena.account,
 kind text NOT NULL CHECK(kind IN ('self','guardian')), active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(person_id,subject),
 FOREIGN KEY(person_id,organization_id) REFERENCES forena.person(id,organization_id)
);
CREATE UNIQUE INDEX person_single_self ON forena.person_access(person_id) WHERE kind='self';
CREATE INDEX person_access_subject ON forena.person_access(subject,organization_id,person_id) WHERE active;
CREATE TABLE forena.revoked_session (
 id uuid PRIMARY KEY, subject uuid NOT NULL REFERENCES forena.account, revoked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE forena.account ENABLE ROW LEVEL SECURITY;
ALTER TABLE forena.account FORCE ROW LEVEL SECURITY;
CREATE POLICY own_account ON forena.account TO forena_api_runtime USING (
 subject=nullif(current_setting('forena.actor_id',true),'')::uuid AND enabled);
ALTER TABLE forena.person_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE forena.person_access FORCE ROW LEVEL SECURITY;
CREATE POLICY own_links ON forena.person_access TO forena_api_runtime USING (
 subject=nullif(current_setting('forena.actor_id',true),'')::uuid AND active
 AND EXISTS(SELECT 1 FROM forena.account a WHERE a.subject=person_access.subject));
ALTER TABLE forena.revoked_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE forena.revoked_session FORCE ROW LEVEL SECURITY;
CREATE POLICY own_revocation ON forena.revoked_session TO forena_api_runtime USING (
 subject=nullif(current_setting('forena.actor_id',true),'')::uuid);

CREATE FUNCTION forena.can_act_for(person uuid, organization uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,forena AS $$
 SELECT EXISTS(SELECT 1 FROM forena.person_access p
  WHERE p.person_id=person AND p.organization_id=organization
    AND p.subject=nullif(current_setting('forena.actor_id',true),'')::uuid AND p.active
    AND EXISTS(SELECT 1 FROM forena.account a WHERE a.subject=p.subject AND a.enabled))
$$;
REVOKE ALL ON FUNCTION forena.can_act_for(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION forena.can_act_for(uuid,uuid) TO forena_api_runtime;
ALTER TABLE forena.person ENABLE ROW LEVEL SECURITY;
ALTER TABLE forena.person FORCE ROW LEVEL SECURITY;
CREATE POLICY family_people ON forena.person TO forena_api_runtime USING (forena.can_act_for(id,organization_id));
ALTER TABLE forena.organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE forena.organization FORCE ROW LEVEL SECURITY;
CREATE POLICY family_organizations ON forena.organization TO forena_api_runtime USING (
 EXISTS(SELECT 1 FROM forena.person_access p WHERE p.organization_id=organization.id));
GRANT SELECT ON forena.account,forena.person_access,forena.revoked_session,forena.person,forena.organization TO forena_api_runtime;
