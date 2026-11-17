-- Account identity is separate from club people and authentication credentials.
ALTER TABLE forena.account ADD COLUMN display_name text NOT NULL DEFAULT '';
ALTER TABLE forena.account ADD COLUMN phone text NOT NULL DEFAULT '';
ALTER TABLE forena.account ADD COLUMN profile_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE forena.person ADD COLUMN phone text NOT NULL DEFAULT '';
ALTER TABLE forena.person ADD COLUMN contact_email text NOT NULL DEFAULT '';
ALTER TABLE forena.person ADD COLUMN address text NOT NULL DEFAULT '';
ALTER TABLE forena.person ADD COLUMN profile_revision bigint NOT NULL DEFAULT 0;
CREATE TABLE forena.account_child_link (
 subject uuid NOT NULL REFERENCES forena.account, person_id uuid NOT NULL REFERENCES forena.person,
 group_id uuid NOT NULL, PRIMARY KEY(subject,person_id)
);
CREATE INDEX account_child_link_group ON forena.account_child_link(subject,group_id);
CREATE TABLE forena.person_profile_history (
 id uuid PRIMARY KEY, person_id uuid NOT NULL, organization_id uuid NOT NULL,
 actor_subject uuid NOT NULL REFERENCES forena.account, changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 changes text NOT NULL, FOREIGN KEY(person_id,organization_id) REFERENCES forena.person(id,organization_id)
);
CREATE INDEX person_profile_history_person ON forena.person_profile_history(person_id,changed_at DESC);
CREATE TABLE forena.account_email_change (
 subject uuid PRIMARY KEY REFERENCES forena.account, email varchar(320) NOT NULL,
 fingerprint text NOT NULL UNIQUE, auth_version bigint NOT NULL, session_id varchar(36) NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE TABLE forena.account_follower (
 id uuid PRIMARY KEY, subject uuid NOT NULL REFERENCES forena.account,
 person_id uuid NOT NULL, organization_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','denied','revoked')),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(person_id,organization_id) REFERENCES forena.person(id,organization_id)
);
CREATE UNIQUE INDEX account_follower_current ON forena.account_follower(subject,person_id) WHERE state IN ('pending','approved');
CREATE TABLE forena.account_guardian_proposal (
 id uuid PRIMARY KEY, proposer uuid NOT NULL REFERENCES forena.account,
 person_id uuid NOT NULL, organization_id uuid NOT NULL, guardian_email varchar(320) NOT NULL,
 operation text NOT NULL CHECK(operation IN ('add','remove','birth-date-correction')),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','denied')),
 reviewed_by uuid REFERENCES forena.account, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(person_id,organization_id) REFERENCES forena.person(id,organization_id)
);
CREATE TABLE forena.account_lifecycle (
 subject uuid PRIMARY KEY REFERENCES forena.account, activated_at timestamptz,
 disconnected_at timestamptz, reminder_sent boolean NOT NULL DEFAULT false,
 deleted_at timestamptz
);
-- Existing approved relationships are discovered by the service, never inferred from matching personal data.
INSERT INTO forena.account_lifecycle(subject) SELECT subject FROM forena.account;
ALTER TABLE forena.account_lifecycle ADD COLUMN connection_until timestamptz;
ALTER TABLE forena.spring_session ADD COLUMN device_label text NOT NULL DEFAULT 'Okänd webbläsare/enhet';

-- Initialize the global display name from an existing own person, without rewriting club people.
UPDATE forena.account a SET display_name=coalesce((
 SELECT p.display_name FROM forena.person_access own JOIN forena.person p ON p.id=own.person_id
 WHERE own.subject=a.subject AND own.kind='self' AND own.active ORDER BY p.id LIMIT 1
),'');

CREATE INDEX account_guardian_proposal_person ON forena.account_guardian_proposal(person_id,created_at DESC);
CREATE INDEX account_follower_person ON forena.account_follower(person_id,organization_id) WHERE state='approved';
ALTER TABLE forena.account_lifecycle ADD COLUMN checked_at timestamptz NOT NULL DEFAULT '-infinity';
