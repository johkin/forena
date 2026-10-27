-- Extend the calendar's existing reports in place; never rewrite migration 018.
ALTER TABLE forena.invitation ADD COLUMN activity_role text
 CHECK(activity_role IN ('participant','leader','volunteer','guardian'));
ALTER TABLE forena.attendance_report ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK(revision > 0);
ALTER TABLE forena.attendance_record ADD COLUMN role text NOT NULL DEFAULT 'participant'
 CHECK(role IN ('participant','leader','volunteer','guardian'));
ALTER TABLE forena.attendance_record ADD COLUMN present boolean NOT NULL DEFAULT true;

-- Preserve existing present records and materialize the assessed absent roster.
INSERT INTO forena.attendance_record(activity_id,organization_id,person_id,role,present)
 SELECT DISTINCT r.activity_id,r.organization_id,p.person_id,
   coalesce((SELECT CASE WHEN bool_or(m.role='leader') THEN 'leader' ELSE 'participant' END
      FROM forena.team_membership m
      WHERE m.team_id=a.team_id AND m.person_id=p.person_id AND m.role IN ('participant','leader')
        AND m.starts_on<=(a.starts_at AT TIME ZONE o.time_zone)::date
        AND (m.ends_on IS NULL OR m.ends_on>=(a.starts_at AT TIME ZONE o.time_zone)::date)), 'participant'), false
 FROM forena.attendance_report r JOIN forena.activity a ON a.id=r.activity_id
 JOIN forena.organization o ON o.id=r.organization_id
 CROSS JOIN LATERAL (
   SELECT m.person_id FROM forena.team_membership m
    WHERE m.team_id=a.team_id AND m.role IN ('participant','leader')
      AND m.starts_on<=(a.starts_at AT TIME ZONE o.time_zone)::date
      AND (m.ends_on IS NULL OR m.ends_on>=(a.starts_at AT TIME ZONE o.time_zone)::date)
   UNION SELECT i.person_id FROM forena.invitation i WHERE i.activity_id=a.id
 ) p
 ON CONFLICT(activity_id,person_id) DO NOTHING;

UPDATE forena.attendance_record r SET role='leader'
 FROM forena.activity a,forena.organization o
 WHERE a.id=r.activity_id AND o.id=a.organization_id AND EXISTS (
   SELECT 1 FROM forena.team_membership m WHERE m.team_id=a.team_id AND m.person_id=r.person_id
     AND m.role='leader' AND m.starts_on<=(a.starts_at AT TIME ZONE o.time_zone)::date
     AND (m.ends_on IS NULL OR m.ends_on>=(a.starts_at AT TIME ZONE o.time_zone)::date)
 );

CREATE TABLE forena.attendance_history (
 id uuid PRIMARY KEY, activity_id uuid NOT NULL, organization_id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision > 0), actor_subject uuid NOT NULL REFERENCES forena.account,
 actor_name text NOT NULL, changed_at timestamptz NOT NULL,
 FOREIGN KEY(activity_id,organization_id) REFERENCES forena.attendance_report(activity_id,organization_id),
 UNIQUE(activity_id,revision)
);
CREATE TABLE forena.attendance_change (
 history_id uuid NOT NULL REFERENCES forena.attendance_history,
 person_id uuid NOT NULL REFERENCES forena.person, display_name text NOT NULL,
 previous_present boolean, present boolean NOT NULL,
 PRIMARY KEY(history_id,person_id)
);
CREATE INDEX attendance_history_activity ON forena.attendance_history(activity_id,revision);

-- Imported baseline records what is known, without inventing earlier corrections.
INSERT INTO forena.attendance_history(id,activity_id,organization_id,revision,actor_subject,actor_name,changed_at)
 SELECT gen_random_uuid(),r.activity_id,r.organization_id,r.revision,r.reported_by,
   coalesce((SELECT p.display_name FROM forena.person_access x
      JOIN forena.person p ON p.id=x.person_id AND p.organization_id=x.organization_id
      WHERE x.subject=r.reported_by AND x.organization_id=r.organization_id AND x.kind='self' AND x.active
      ORDER BY p.id LIMIT 1),r.reported_by::text),r.reported_at
 FROM forena.attendance_report r;
INSERT INTO forena.attendance_change(history_id,person_id,display_name,previous_present,present)
 SELECT h.id,r.person_id,p.display_name,NULL,r.present
 FROM forena.attendance_history h JOIN forena.attendance_record r ON r.activity_id=h.activity_id
 JOIN forena.person p ON p.id=r.person_id AND p.organization_id=r.organization_id;
