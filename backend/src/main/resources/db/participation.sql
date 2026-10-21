CREATE TABLE forena.team (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES forena.organization,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200), UNIQUE(id,organization_id)
);
CREATE TABLE forena.activity (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, team_id uuid NOT NULL,
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 invitation_send_at timestamptz, status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','cancelled')),
 FOREIGN KEY(team_id,organization_id) REFERENCES forena.team(id,organization_id), UNIQUE(id,organization_id)
);
CREATE TABLE forena.invitation (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, activity_id uuid NOT NULL, person_id uuid NOT NULL,
 response text NOT NULL DEFAULT 'pending' CHECK(response IN ('pending','accepted','declined')),
 response_comment text CHECK(length(response_comment)<=500), responded_at timestamptz,
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
 FOREIGN KEY(activity_id,organization_id) REFERENCES forena.activity(id,organization_id),
 FOREIGN KEY(person_id,organization_id) REFERENCES forena.person(id,organization_id),
 UNIQUE(activity_id,person_id), UNIQUE(id,organization_id),
 CHECK((response='pending' AND responded_at IS NULL AND response_comment IS NULL)
    OR (response<>'pending' AND responded_at IS NOT NULL))
);
CREATE INDEX invitation_activity ON forena.invitation(activity_id,person_id);
CREATE INDEX invitation_person ON forena.invitation(person_id,organization_id);
CREATE TABLE forena.invitation_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invitation_id uuid NOT NULL, organization_id uuid NOT NULL,
 actor_subject uuid NOT NULL REFERENCES forena.account, session_id uuid NOT NULL,
 channel text NOT NULL CHECK(channel='web'), changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 previous_response text NOT NULL, response text NOT NULL, revision bigint NOT NULL,
 FOREIGN KEY(invitation_id,organization_id) REFERENCES forena.invitation(id,organization_id),
 UNIQUE(invitation_id,revision)
);
-- Durable invalidation/version, not a second outbox or an external delivery claim.
CREATE TABLE forena.activity_signal_state (
 activity_id uuid PRIMARY KEY REFERENCES forena.activity,
 dirty_revision bigint NOT NULL DEFAULT 1 CHECK(dirty_revision>0), changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE forena.team ENABLE ROW LEVEL SECURITY;
ALTER TABLE forena.team FORCE ROW LEVEL SECURITY;
-- This API does not read team details. No runtime SELECT policy or grant.
ALTER TABLE forena.invitation ENABLE ROW LEVEL SECURITY;
ALTER TABLE forena.invitation FORCE ROW LEVEL SECURITY;
CREATE POLICY family_invitation_read ON forena.invitation FOR SELECT TO forena_api_runtime
 USING(forena.can_act_for(person_id,organization_id));
CREATE POLICY family_invitation_update ON forena.invitation FOR UPDATE TO forena_api_runtime
 USING(forena.can_act_for(person_id,organization_id)) WITH CHECK(forena.can_act_for(person_id,organization_id));
ALTER TABLE forena.activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE forena.activity FORCE ROW LEVEL SECURITY;
CREATE POLICY invited_activity ON forena.activity FOR SELECT TO forena_api_runtime USING (
 EXISTS(SELECT 1 FROM forena.invitation i WHERE i.activity_id=activity.id AND i.organization_id=activity.organization_id));
-- Narrow trigger owner access permits lifecycle row locking without activity UPDATE grants to runtime.
CREATE POLICY lifecycle_owner ON forena.activity TO forena_api_owner USING(true) WITH CHECK(true);
ALTER TABLE forena.invitation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE forena.invitation_history FORCE ROW LEVEL SECURITY;
CREATE POLICY family_history ON forena.invitation_history FOR SELECT TO forena_api_runtime USING (
 EXISTS(SELECT 1 FROM forena.invitation i WHERE i.id=invitation_history.invitation_id));
CREATE POLICY history_owner ON forena.invitation_history TO forena_api_owner USING(true) WITH CHECK(true);
ALTER TABLE forena.activity_signal_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE forena.activity_signal_state FORCE ROW LEVEL SECURITY;
CREATE POLICY signal_owner ON forena.activity_signal_state TO forena_api_owner USING(true) WITH CHECK(true);

CREATE FUNCTION forena.guard_response() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,forena AS $$
DECLARE a forena.activity%ROWTYPE;
BEGIN
 IF NEW.response='pending' THEN NEW.response_comment:=NULL; END IF;
 IF (NEW.response,NEW.response_comment) IS NOT DISTINCT FROM (OLD.response,OLD.response_comment) THEN RETURN NULL; END IF;
 SELECT * INTO a FROM forena.activity WHERE id=OLD.activity_id FOR SHARE;
 IF NOT FOUND OR a.status='cancelled' OR a.ends_at<=clock_timestamp()
    OR (a.invitation_send_at IS NOT NULL AND a.invitation_send_at>clock_timestamp()) THEN
   RAISE EXCEPTION 'Invitation is read-only' USING ERRCODE='23514';
 END IF;
 IF NEW.response='pending' THEN NEW.responded_at:=NULL;
 ELSIF NEW.response IS DISTINCT FROM OLD.response THEN NEW.responded_at:=clock_timestamp();
 ELSE NEW.responded_at:=OLD.responded_at; END IF;
 NEW.revision:=OLD.revision+1;
 RETURN NEW;
END $$;
CREATE FUNCTION forena.record_response() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,forena AS $$
BEGIN
 INSERT INTO forena.invitation_history(invitation_id,organization_id,actor_subject,session_id,channel,previous_response,response,revision)
 VALUES(NEW.id,NEW.organization_id,nullif(current_setting('forena.actor_id',true),'')::uuid,
 nullif(current_setting('forena.session_id',true),'')::uuid,'web',OLD.response,NEW.response,NEW.revision);
 IF NEW.response IS DISTINCT FROM OLD.response THEN
   INSERT INTO forena.activity_signal_state(activity_id) VALUES(NEW.activity_id)
   ON CONFLICT(activity_id) DO UPDATE SET dirty_revision=activity_signal_state.dirty_revision+1,changed_at=clock_timestamp();
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION forena.guard_response(),forena.record_response() FROM PUBLIC,forena_api_runtime;
CREATE TRIGGER invitation_guard BEFORE UPDATE ON forena.invitation FOR EACH ROW EXECUTE FUNCTION forena.guard_response();
CREATE TRIGGER invitation_record AFTER UPDATE ON forena.invitation FOR EACH ROW EXECUTE FUNCTION forena.record_response();
GRANT SELECT ON forena.activity,forena.invitation,forena.invitation_history TO forena_api_runtime;
GRANT UPDATE(response,response_comment) ON forena.invitation TO forena_api_runtime;
REVOKE ALL ON forena.databasechangelog,forena.databasechangeloglock FROM forena_api_runtime;
