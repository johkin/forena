-- Calendar reads retain the original lifecycle and a tombstone for audit integrity.
ALTER TABLE forena.activity ADD COLUMN leaders_only boolean NOT NULL DEFAULT false;
ALTER TABLE forena.activity ADD COLUMN deleted_at timestamptz;
ALTER TABLE forena.activity_audit DROP CONSTRAINT activity_audit_operation_check;
ALTER TABLE forena.activity_audit ADD CONSTRAINT activity_audit_operation_check
 CHECK(operation IN ('created','updated','cancelled','deleted'));
ALTER TABLE forena.team_permission_assignment DROP CONSTRAINT team_permission_assignment_permission_check;
ALTER TABLE forena.team_permission_assignment ADD CONSTRAINT team_permission_assignment_permission_check
 CHECK(permission IN ('activity.manage','invitation.manage','roster.manage','attendance.manage'));

-- A report distinguishes a recorded absence from attendance that has never been reported.
CREATE TABLE forena.attendance_report (
 activity_id uuid PRIMARY KEY, organization_id uuid NOT NULL,
 reported_by uuid NOT NULL REFERENCES forena.account, reported_at timestamptz NOT NULL,
 FOREIGN KEY(activity_id,organization_id) REFERENCES forena.activity(id,organization_id),
 UNIQUE(activity_id,organization_id)
);
CREATE TABLE forena.attendance_record (
 activity_id uuid NOT NULL, organization_id uuid NOT NULL, person_id uuid NOT NULL,
 PRIMARY KEY(activity_id,person_id),
 FOREIGN KEY(activity_id,organization_id) REFERENCES forena.attendance_report(activity_id,organization_id),
 FOREIGN KEY(person_id,organization_id) REFERENCES forena.person(id,organization_id)
);
CREATE INDEX attendance_record_person ON forena.attendance_record(person_id,activity_id);
UPDATE forena.activity a SET leaders_only=true WHERE EXISTS (
 SELECT 1 FROM forena.activity_schedule s WHERE s.activity_id=a.id AND s.kind='invitation'
 AND s.audience_roles='leader' AND s.person_ids='' AND s.group_ids='' AND s.responsibility_type_ids=''
);
