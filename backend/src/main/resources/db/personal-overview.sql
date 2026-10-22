-- Personal overview reads memberships independently from invitation/response rights.
ALTER TABLE forena.organization ADD COLUMN time_zone text NOT NULL DEFAULT 'Europe/Stockholm';
ALTER TABLE forena.activity ADD COLUMN location text NOT NULL DEFAULT '';
ALTER TABLE forena.activity ADD COLUMN description text NOT NULL DEFAULT '';
ALTER TABLE forena.activity ADD COLUMN gathering_at timestamptz;
ALTER TABLE forena.activity ADD COLUMN response_due_at timestamptz;

CREATE TABLE forena.team_membership (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 team_id uuid NOT NULL, person_id uuid NOT NULL,
 role text NOT NULL CHECK(role IN ('leader','participant','member')),
 starts_on date NOT NULL, ends_on date, active boolean NOT NULL DEFAULT true,
 CHECK(ends_on IS NULL OR ends_on >= starts_on),
 FOREIGN KEY(team_id,organization_id) REFERENCES forena.team(id,organization_id),
 FOREIGN KEY(person_id,organization_id) REFERENCES forena.person(id,organization_id)
);
CREATE INDEX team_membership_person ON forena.team_membership(person_id,team_id,starts_on,ends_on) WHERE active;
CREATE INDEX team_membership_team ON forena.team_membership(team_id,person_id) WHERE active;

CREATE TABLE forena.team_access_assignment (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 team_id uuid NOT NULL, person_id uuid NOT NULL,
 starts_on date NOT NULL, ends_on date, active boolean NOT NULL DEFAULT true,
 CHECK(ends_on IS NULL OR ends_on >= starts_on),
 FOREIGN KEY(team_id,organization_id) REFERENCES forena.team(id,organization_id),
 FOREIGN KEY(person_id,organization_id) REFERENCES forena.person(id,organization_id)
);
CREATE INDEX team_access_person ON forena.team_access_assignment(person_id,team_id,starts_on,ends_on) WHERE active;
CREATE INDEX team_access_team ON forena.team_access_assignment(team_id,person_id) WHERE active;

CREATE TABLE forena.organization_member (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES forena.organization,
 subject uuid NOT NULL REFERENCES forena.account,
 role text NOT NULL CHECK(role IN ('owner','admin','leader','member')),
 active boolean NOT NULL DEFAULT true, UNIQUE(organization_id,subject)
);
CREATE INDEX organization_member_subject ON forena.organization_member(subject,organization_id) WHERE active;
-- ADR-021's owner default privileges give runtime DML, with no DDL or client access.
