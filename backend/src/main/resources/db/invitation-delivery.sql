-- Modulith 2.1.0 JDBC v2 schema. Liquibase owns DDL; Modulith owns registry writes.
CREATE TABLE forena.event_publication (
 id uuid PRIMARY KEY,
 listener_id text NOT NULL,
 event_type text NOT NULL,
 serialized_event text NOT NULL,
 publication_date timestamptz NOT NULL,
 completion_date timestamptz,
 status text,
 completion_attempts integer,
 last_resubmission_date timestamptz
);
CREATE INDEX event_publication_serialized_event_hash_idx ON forena.event_publication USING hash(serialized_event);
CREATE INDEX event_publication_by_completion_date_idx ON forena.event_publication(completion_date);
CREATE INDEX event_publication_recovery ON forena.event_publication
 (greatest(publication_date,last_resubmission_date),id) WHERE completion_date IS NULL;

ALTER TABLE forena.activity_schedule DROP CONSTRAINT activity_schedule_state_check;
ALTER TABLE forena.activity_schedule ADD CONSTRAINT activity_schedule_state_check
 CHECK(state IN ('pending','cancelled','completed','failed'));
ALTER TABLE forena.activity_schedule ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0);
ALTER TABLE forena.activity_schedule ADD COLUMN next_attempt timestamptz NOT NULL DEFAULT now();
ALTER TABLE forena.activity_schedule ADD COLUMN last_error text;
ALTER TABLE forena.activity_schedule ADD COLUMN completed_at timestamptz;

-- A checkpoint survives transport retention. A schedule/recipient decision never gets a second ID.
CREATE TABLE forena.invitation_notification (
 id uuid PRIMARY KEY,
 schedule_id uuid NOT NULL REFERENCES forena.activity_schedule,
 invitation_id uuid NOT NULL REFERENCES forena.invitation,
 recipient_subject uuid NOT NULL REFERENCES forena.account,
 decided_at timestamptz NOT NULL,
 recipient varchar(320) NOT NULL,
 subject text NOT NULL,
 body text NOT NULL,
 UNIQUE(schedule_id,invitation_id,recipient_subject)
);
-- Specialized transport attempts, not a second module event queue. The registry hands over atomically.
CREATE TABLE forena.invitation_email (
 id uuid PRIMARY KEY REFERENCES forena.invitation_notification,
 recipient varchar(320) NOT NULL,
 subject text NOT NULL,
 body text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','accepted','failed','uncertain','suppressed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 next_attempt timestamptz NOT NULL DEFAULT now(),
 first_attempt_at timestamptz,
 provider_message_id text,
 accepted_at timestamptz,
 last_error text
);
CREATE INDEX invitation_email_due ON forena.invitation_email(next_attempt,id) WHERE state='pending';
CREATE INDEX activity_schedule_retry ON forena.activity_schedule(next_attempt,due_at,id) WHERE state='pending';
CREATE TABLE forena.notification_worker_state (
 id integer PRIMARY KEY CHECK(id = 1),
 started_at timestamptz,
 completed_at timestamptz
);
INSERT INTO forena.notification_worker_state(id) VALUES(1);
-- No Data API grants: tables inherit the private owner's runtime defaults from migration 010.
