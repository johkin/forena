-- Roster commands reuse the same groups as scheduled invitation audiences.
ALTER TABLE forena.team_permission_assignment DROP CONSTRAINT team_permission_assignment_permission_check;
ALTER TABLE forena.team_permission_assignment ADD CONSTRAINT team_permission_assignment_permission_check
 CHECK(permission IN ('activity.manage','invitation.manage','roster.manage'));
ALTER TABLE forena.team_membership DROP CONSTRAINT team_membership_role_check;
ALTER TABLE forena.team_membership ADD CONSTRAINT team_membership_role_check
 CHECK(length(trim(role)) BETWEEN 1 AND 80);
ALTER TABLE forena.team_audience_group ADD COLUMN revision bigint NOT NULL DEFAULT 0 CHECK(revision >= 0);
CREATE UNIQUE INDEX team_roster_group_name ON forena.team_audience_group(team_id, lower(trim(name))) WHERE kind='group';
ALTER TABLE forena.person_access ADD COLUMN contact_name text NOT NULL DEFAULT '';
ALTER TABLE forena.person_access ADD COLUMN contact_phone text NOT NULL DEFAULT '';
CREATE TABLE forena.roster_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES forena.organization,
 team_id uuid NOT NULL, actor_subject uuid NOT NULL REFERENCES forena.account,
 operation text NOT NULL CHECK(operation IN ('member.updated','group.created','group.updated','group.deleted')),
 target_id uuid NOT NULL, changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(team_id,organization_id) REFERENCES forena.team(id,organization_id)
);
CREATE INDEX roster_audit_team ON forena.roster_audit(team_id,changed_at);
