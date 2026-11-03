-- Memberships exist independently from login accounts. No client grants.
ALTER TABLE forena.roster_audit DROP CONSTRAINT roster_audit_operation_check;
ALTER TABLE forena.roster_audit ADD CONSTRAINT roster_audit_operation_check
 CHECK(operation IN ('member.updated','member.created','member.invited','member.linked','group.created','group.updated','group.deleted'));
CREATE TABLE forena.roster_registration (
 request_id uuid PRIMARY KEY, team_id uuid NOT NULL REFERENCES forena.team,
 actor_subject uuid NOT NULL REFERENCES forena.account,
 person_id uuid NOT NULL REFERENCES forena.person
);
CREATE TABLE forena.roster_login_invitation (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, team_id uuid NOT NULL,
 person_id uuid NOT NULL, email varchar(320) NOT NULL CHECK(email=lower(email)),
 token_hash text NOT NULL UNIQUE, inviter uuid NOT NULL REFERENCES forena.account,
 mail_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL, revoked boolean NOT NULL DEFAULT false,
 accepted_by uuid REFERENCES forena.account,
 FOREIGN KEY(team_id,organization_id) REFERENCES forena.team(id,organization_id),
 FOREIGN KEY(person_id,organization_id) REFERENCES forena.person(id,organization_id)
);
CREATE INDEX roster_login_person ON forena.roster_login_invitation(person_id,created_at DESC);
