-- Versioned object values remain private to the Kotlin API. No client grants or business triggers.
ALTER TABLE forena.activity ADD COLUMN max_participants integer CHECK(max_participants > 0);
ALTER TABLE forena.activity ADD CONSTRAINT activity_team_identity UNIQUE(id,team_id,organization_id);
CREATE TABLE forena.discipline_value (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 team_id uuid NOT NULL,
 discipline_key text NOT NULL,
 package_version text NOT NULL,
 scope text NOT NULL CHECK(scope IN ('team','teamMembership','activity','activityParticipation')),
 anchor_id uuid NOT NULL,
 activity_id uuid,
 person_id uuid,
 revision bigint NOT NULL CHECK(revision > 0),
 values_json text NOT NULL,
 FOREIGN KEY(team_id,organization_id) REFERENCES forena.team(id,organization_id),
 FOREIGN KEY(activity_id,team_id,organization_id) REFERENCES forena.activity(id,team_id,organization_id),
 FOREIGN KEY(person_id,organization_id) REFERENCES forena.person(id,organization_id),
 CHECK((scope IN ('activity','activityParticipation')) = (activity_id IS NOT NULL)),
 CHECK((scope IN ('teamMembership','activityParticipation')) = (person_id IS NOT NULL)),
 CHECK((scope='team' AND anchor_id=team_id)
    OR (scope='teamMembership' AND anchor_id=person_id)
    OR (scope IN ('activity','activityParticipation') AND anchor_id=activity_id)),
 UNIQUE(team_id,discipline_key,scope,anchor_id,person_id)
);
CREATE UNIQUE INDEX discipline_value_identity ON forena.discipline_value
 (team_id,discipline_key,scope,anchor_id) WHERE person_id IS NULL;
CREATE INDEX discipline_value_activity ON forena.discipline_value(activity_id) WHERE activity_id IS NOT NULL;
CREATE INDEX discipline_value_person ON forena.discipline_value(person_id) WHERE person_id IS NOT NULL;
CREATE TABLE forena.discipline_value_audit (
 id uuid PRIMARY KEY, value_id uuid NOT NULL REFERENCES forena.discipline_value,
 actor_subject uuid NOT NULL REFERENCES forena.account,
 revision bigint NOT NULL, changed_at timestamptz NOT NULL,
 UNIQUE(value_id,revision)
);
