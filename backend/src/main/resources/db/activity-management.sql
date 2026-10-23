-- Single-activity commands own these rows in one application transaction.
CREATE TABLE forena.section (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES forena.organization,
 name text NOT NULL, discipline_key text NOT NULL DEFAULT 'common', UNIQUE(id,organization_id)
);
ALTER TABLE forena.team ADD COLUMN section_id uuid;
ALTER TABLE forena.team ADD FOREIGN KEY(section_id,organization_id) REFERENCES forena.section(id,organization_id);
CREATE TABLE forena.team_permission_assignment (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 team_id uuid NOT NULL, person_id uuid NOT NULL, permission text NOT NULL
 CHECK(permission IN ('activity.manage','invitation.manage')),
 starts_on date NOT NULL, ends_on date, active boolean NOT NULL DEFAULT true,
 CHECK(ends_on IS NULL OR ends_on>=starts_on),
 FOREIGN KEY(team_id,organization_id) REFERENCES forena.team(id,organization_id),
 FOREIGN KEY(person_id,organization_id) REFERENCES forena.person(id,organization_id)
);
CREATE INDEX team_permission_person ON forena.team_permission_assignment(person_id,team_id) WHERE active;
CREATE TABLE forena.activity_type (
 id uuid PRIMARY KEY, organization_id uuid REFERENCES forena.organization,
 name text NOT NULL, slug text NOT NULL, system_category text NOT NULL,
 discipline_key text, active boolean NOT NULL DEFAULT true
);
INSERT INTO forena.activity_type(id,name,slug,system_category) VALUES
 ('00000000-0000-4000-8000-000000000001','Träning','traning','session'),
 ('00000000-0000-4000-8000-000000000002','Tävling/Match','match-tavling','competition'),
 ('00000000-0000-4000-8000-000000000003','Arbetspass','arbetspass','work'),
 ('00000000-0000-4000-8000-000000000004','Övrigt','ovrigt','other');
ALTER TABLE forena.activity ADD COLUMN activity_type_id uuid REFERENCES forena.activity_type;
ALTER TABLE forena.activity ADD COLUMN revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0);
ALTER TABLE forena.activity ADD COLUMN cancelled_at timestamptz;
ALTER TABLE forena.activity ADD COLUMN cancellation_reason text;
ALTER TABLE forena.activity ADD CONSTRAINT gathering_before_start CHECK(gathering_at IS NULL OR gathering_at<=starts_at);
CREATE TABLE forena.activity_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), activity_id uuid NOT NULL REFERENCES forena.activity,
 organization_id uuid NOT NULL, actor_subject uuid NOT NULL REFERENCES forena.account,
 operation text NOT NULL CHECK(operation IN ('created','updated','cancelled')),
 revision bigint NOT NULL, changed_at timestamptz NOT NULL,
 UNIQUE(activity_id,revision),
 FOREIGN KEY(activity_id,organization_id) REFERENCES forena.activity(id,organization_id)
);
CREATE TABLE forena.activity_schedule (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), activity_id uuid NOT NULL, organization_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('invitation','reminder')), due_at timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','cancelled')),
 audience_roles text NOT NULL DEFAULT '', person_ids text NOT NULL DEFAULT '',
 UNIQUE(activity_id,kind,due_at),
 FOREIGN KEY(activity_id,organization_id) REFERENCES forena.activity(id,organization_id)
);
-- Delivery remains M06/M10. No in-memory sender or second transport outbox.

CREATE INDEX activity_team_start ON forena.activity(team_id,starts_at,id);
CREATE INDEX activity_schedule_pending ON forena.activity_schedule(due_at,id) WHERE state='pending';
CREATE TABLE forena.activity_defaults (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 section_id uuid, team_id uuid, activity_type_id uuid NOT NULL REFERENCES forena.activity_type,
 discipline_key text NOT NULL, version text NOT NULL DEFAULT '1.0.0',
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), values_json text NOT NULL,
 CHECK((section_id IS NULL) <> (team_id IS NULL)),
 FOREIGN KEY(section_id,organization_id) REFERENCES forena.section(id,organization_id),
 FOREIGN KEY(team_id,organization_id) REFERENCES forena.team(id,organization_id)
);
CREATE UNIQUE INDEX activity_defaults_section ON forena.activity_defaults(section_id,activity_type_id) WHERE section_id IS NOT NULL;
CREATE UNIQUE INDEX activity_defaults_team ON forena.activity_defaults(team_id,activity_type_id) WHERE team_id IS NOT NULL;
CREATE TABLE forena.team_audience_group (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, team_id uuid NOT NULL,
 name text NOT NULL, kind text NOT NULL CHECK(kind IN ('group','responsibility')),
 FOREIGN KEY(team_id,organization_id) REFERENCES forena.team(id,organization_id),
 UNIQUE(id,organization_id)
);
CREATE TABLE forena.team_audience_member (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), group_id uuid NOT NULL, organization_id uuid NOT NULL,
 person_id uuid NOT NULL, active boolean NOT NULL DEFAULT true,
 FOREIGN KEY(group_id,organization_id) REFERENCES forena.team_audience_group(id,organization_id),
 FOREIGN KEY(person_id,organization_id) REFERENCES forena.person(id,organization_id), UNIQUE(group_id,person_id)
);
ALTER TABLE forena.activity_schedule ADD COLUMN group_ids text NOT NULL DEFAULT '';
ALTER TABLE forena.activity_schedule ADD COLUMN responsibility_type_ids text NOT NULL DEFAULT '';
CREATE INDEX activity_audit_activity ON forena.activity_audit(activity_id,changed_at);
