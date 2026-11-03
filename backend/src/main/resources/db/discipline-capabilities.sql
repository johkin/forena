CREATE TABLE forena.activity_capability (
 activity_id uuid NOT NULL REFERENCES forena.activity ON DELETE CASCADE,
 capability_key text NOT NULL, discipline_key text NOT NULL, package_version text NOT NULL,
 definition_version text NOT NULL, notifications_enabled boolean NOT NULL,
 hours_json text NOT NULL, PRIMARY KEY(activity_id,capability_key)
);
CREATE TABLE forena.capability_checkpoint (
 activity_id uuid NOT NULL, capability_key text NOT NULL, hours integer NOT NULL,
 queued_at timestamptz NOT NULL DEFAULT current_timestamp,
 PRIMARY KEY(activity_id,capability_key,hours),
 FOREIGN KEY(activity_id,capability_key) REFERENCES forena.activity_capability ON DELETE CASCADE
);
CREATE TABLE forena.capability_evaluation (
 activity_id uuid PRIMARY KEY REFERENCES forena.activity ON DELETE CASCADE,
 run_at timestamptz, revision bigint NOT NULL DEFAULT 1, attempts integer NOT NULL DEFAULT 0,
 failed boolean NOT NULL DEFAULT false
);
CREATE INDEX capability_evaluation_due ON forena.capability_evaluation(run_at,activity_id) WHERE NOT failed AND run_at IS NOT NULL;
CREATE TABLE forena.capability_signal (
 id uuid PRIMARY KEY, activity_id uuid NOT NULL REFERENCES forena.activity ON DELETE CASCADE,
 team_id uuid NOT NULL REFERENCES forena.team, discipline_key text NOT NULL, capability_key text NOT NULL,
 signal_type text NOT NULL, state text NOT NULL CHECK(state IN ('active','dismissed','resolved')),
 severity text NOT NULL, title text NOT NULL, text text NOT NULL, actions_json text NOT NULL,
 revision bigint NOT NULL, episode bigint NOT NULL, evaluated_at timestamptz NOT NULL,
 UNIQUE(activity_id,discipline_key,capability_key,signal_type)
);
CREATE TABLE forena.capability_signal_action (
 id uuid PRIMARY KEY, signal_id uuid NOT NULL REFERENCES forena.capability_signal ON DELETE CASCADE,
 episode bigint NOT NULL, actor_subject uuid NOT NULL REFERENCES forena.account,
 action text NOT NULL, result text NOT NULL, created_at timestamptz NOT NULL DEFAULT current_timestamp
);
CREATE TABLE forena.team_capability_audit (
 id uuid PRIMARY KEY, team_id uuid NOT NULL REFERENCES forena.team, capability_key text NOT NULL,
 revision bigint NOT NULL, enabled boolean NOT NULL, actor_subject uuid NOT NULL REFERENCES forena.account,
 changed_at timestamptz NOT NULL DEFAULT current_timestamp, UNIQUE(team_id,capability_key,revision)
);
-- Existing future activities may produce signals, without retroactive notification rules.
INSERT INTO forena.capability_evaluation(activity_id,run_at)
 SELECT id,current_timestamp FROM forena.activity WHERE starts_at>current_timestamp AND deleted_at IS NULL;

ALTER TABLE forena.extension_notification ADD COLUMN created_at timestamptz NOT NULL DEFAULT current_timestamp;

ALTER TABLE forena.discipline_activity_job ADD COLUMN team_id uuid REFERENCES forena.team;
UPDATE forena.discipline_activity_job j SET team_id=a.team_id FROM forena.activity a WHERE a.id=j.activity_id;
ALTER TABLE forena.discipline_activity_job ALTER COLUMN team_id SET NOT NULL;
CREATE INDEX discipline_activity_job_team ON forena.discipline_activity_job(team_id,activity_id) WHERE state='pending';
