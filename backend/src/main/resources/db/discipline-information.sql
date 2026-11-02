CREATE TABLE forena.team_capability (
 team_id uuid NOT NULL REFERENCES forena.team, capability_key text NOT NULL,
 enabled boolean NOT NULL, enabled_at timestamptz NOT NULL, revision bigint NOT NULL CHECK(revision>0),
 PRIMARY KEY(team_id,capability_key)
);
ALTER TABLE forena.activity ADD COLUMN imported boolean NOT NULL DEFAULT false;
CREATE TABLE forena.discipline_information (
 id uuid PRIMARY KEY, activity_id uuid NOT NULL, team_id uuid NOT NULL, organization_id uuid NOT NULL,
 FOREIGN KEY(activity_id,team_id,organization_id) REFERENCES forena.activity(id,team_id,organization_id),
 owner_key text NOT NULL, definition_version text NOT NULL, discipline_key text NOT NULL,
 package_version text NOT NULL, values_json text NOT NULL DEFAULT '{}',
 revision bigint NOT NULL CHECK(revision>0), state text NOT NULL CHECK(state IN ('open','answered','closed')),
 close_reason text, created_at timestamptz NOT NULL,
 UNIQUE(activity_id,owner_key)
);
CREATE INDEX discipline_information_open ON forena.discipline_information(activity_id) WHERE state='open';
CREATE TABLE forena.discipline_information_history (
 id uuid PRIMARY KEY, information_id uuid NOT NULL REFERENCES forena.discipline_information,
 revision bigint NOT NULL, actor_subject uuid REFERENCES forena.account,
 actor_name text NOT NULL, changed_at timestamptz NOT NULL,
 previous_json text NOT NULL, values_json text NOT NULL, names_json text NOT NULL DEFAULT '{}',
 state text NOT NULL, UNIQUE(information_id,revision)
);
CREATE TABLE forena.discipline_activity_job (
 activity_id uuid PRIMARY KEY REFERENCES forena.activity,
 due_at timestamptz NOT NULL, run_at timestamptz NOT NULL DEFAULT current_timestamp,
 attempts integer NOT NULL DEFAULT 0, state text NOT NULL CHECK(state IN ('pending','done','failed')) DEFAULT 'pending'
);
CREATE INDEX discipline_activity_job_due ON forena.discipline_activity_job(due_at,activity_id) WHERE state='pending';
INSERT INTO forena.discipline_activity_job(activity_id,due_at,run_at)
 SELECT id,ends_at,ends_at FROM forena.activity WHERE ends_at>current_timestamp AND deleted_at IS NULL AND status='scheduled';
CREATE TABLE forena.extension_notification (
 id uuid PRIMARY KEY, activity_id uuid NOT NULL REFERENCES forena.activity, purpose text NOT NULL,
 recipient_subject uuid NOT NULL REFERENCES forena.account, title text NOT NULL, body text NOT NULL,
 path text NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','sent','failed')),
 channel_index integer NOT NULL DEFAULT 0, attempted_at timestamptz,
 UNIQUE(activity_id,purpose,recipient_subject)
);
CREATE INDEX extension_notification_pending ON forena.extension_notification(id) WHERE state='pending';
