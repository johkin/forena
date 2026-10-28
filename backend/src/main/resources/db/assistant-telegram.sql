-- Private application schema; authorization belongs to the Kotlin services (ADR-012).
CREATE TABLE forena.telegram_link (
 id uuid PRIMARY KEY, subject uuid NOT NULL UNIQUE REFERENCES forena.account,
 telegram_user_id bigint NOT NULL UNIQUE CHECK(telegram_user_id>0),
 chat_id bigint NOT NULL UNIQUE CHECK(chat_id=telegram_user_id),
 auth_version bigint NOT NULL, linked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_update bigint NOT NULL DEFAULT -1
);
CREATE TABLE forena.telegram_pairing (
 fingerprint varchar(64) PRIMARY KEY, subject uuid NOT NULL REFERENCES forena.account,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX telegram_pairing_subject ON forena.telegram_pairing(subject);
CREATE INDEX telegram_pairing_expiry ON forena.telegram_pairing(expires_at);
CREATE TABLE forena.assistant_conversation (
 id uuid PRIMARY KEY, subject uuid NOT NULL REFERENCES forena.account,
 organization_id uuid REFERENCES forena.organization,
 channel text NOT NULL CHECK(channel IN ('web','telegram')),
 active boolean NOT NULL DEFAULT true, revision bigint NOT NULL DEFAULT 0,
 team_id uuid REFERENCES forena.team, activity_id uuid REFERENCES forena.activity,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,subject)
);
CREATE UNIQUE INDEX assistant_active_conversation ON forena.assistant_conversation
(subject,channel,coalesce(organization_id,'00000000-0000-0000-0000-000000000000')) WHERE active;
CREATE INDEX assistant_conversation_history ON forena.assistant_conversation(subject,updated_at DESC,id);
CREATE TABLE forena.assistant_message (
 id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES forena.assistant_conversation ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('user','assistant')), sender text NOT NULL,
 organization_id uuid REFERENCES forena.organization, content text NOT NULL CHECK(length(content)<=30000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX assistant_message_thread ON forena.assistant_message(conversation_id,created_at,id);
CREATE TABLE forena.assistant_proposal (
 id uuid PRIMARY KEY, conversation_id uuid NOT NULL, subject uuid NOT NULL,
 organization_id uuid REFERENCES forena.organization, team_id uuid REFERENCES forena.team,
 kind text NOT NULL CHECK(kind IN ('memory','activity','series','reminder','duty','response','attendance')),
 label text NOT NULL, payload text NOT NULL, fingerprint text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','completed','invalid')),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '30 minutes',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(conversation_id,subject) REFERENCES forena.assistant_conversation(id,subject) ON DELETE CASCADE
);
CREATE INDEX assistant_pending_proposals ON forena.assistant_proposal(conversation_id,id) WHERE state='pending';
CREATE TABLE forena.assistant_profile (
 organization_id uuid PRIMARY KEY REFERENCES forena.organization,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
 personality text NOT NULL DEFAULT '' CHECK(length(personality)<=2000),
 instructions text NOT NULL DEFAULT '' CHECK(length(instructions)<=6000), revision bigint NOT NULL DEFAULT 1
);
CREATE TABLE forena.assistant_section_profile (
 section_id uuid PRIMARY KEY REFERENCES forena.section,
 instructions text NOT NULL CHECK(length(instructions)<=6000), revision bigint NOT NULL DEFAULT 1
);
CREATE TABLE forena.assistant_memory (
 id uuid PRIMARY KEY, subject uuid REFERENCES forena.account,
 organization_id uuid REFERENCES forena.organization, section_id uuid REFERENCES forena.section,
 team_id uuid REFERENCES forena.team, discipline_key text,
 content text NOT NULL CHECK(length(trim(content)) BETWEEN 1 AND 2000),
 created_by uuid NOT NULL REFERENCES forena.account, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((subject IS NOT NULL AND organization_id IS NULL AND section_id IS NULL AND team_id IS NULL)
    OR (subject IS NULL AND organization_id IS NOT NULL))
);
CREATE INDEX assistant_personal_memory ON forena.assistant_memory(subject) WHERE subject IS NOT NULL;
CREATE INDEX assistant_shared_memory ON forena.assistant_memory(organization_id,section_id,team_id);
CREATE TABLE forena.assistant_usage (
 subject uuid NOT NULL REFERENCES forena.account, bucket timestamptz NOT NULL, questions integer NOT NULL,
 PRIMARY KEY(subject,bucket)
);
CREATE TABLE forena.assistant_profile_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject uuid NOT NULL REFERENCES forena.account,
 organization_id uuid NOT NULL REFERENCES forena.organization, section_id uuid REFERENCES forena.section,
 revision bigint NOT NULL, changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE forena.telegram_update (
 id bigint PRIMARY KEY, state text NOT NULL CHECK(state IN ('processing','completed','failed')),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE forena.telegram_group (
 id uuid PRIMARY KEY, team_id uuid NOT NULL REFERENCES forena.team,
 kind text NOT NULL CHECK(kind IN ('team','leaders')), chat_id bigint NOT NULL UNIQUE CHECK(chat_id<0),
 link_id uuid NOT NULL REFERENCES forena.telegram_link ON DELETE CASCADE,
 invite_url text NOT NULL CHECK(invite_url LIKE 'https://t.me/%'), UNIQUE(team_id,kind)
);
CREATE TABLE forena.telegram_group_pairing (
 fingerprint varchar(64) PRIMARY KEY, team_id uuid NOT NULL REFERENCES forena.team,
 kind text NOT NULL CHECK(kind IN ('team','leaders')),
 link_id uuid NOT NULL REFERENCES forena.telegram_link ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE TABLE forena.telegram_invitation (
 id uuid PRIMARY KEY, notification_id uuid NOT NULL UNIQUE REFERENCES forena.invitation_notification,
 link_id uuid NOT NULL REFERENCES forena.telegram_link ON DELETE CASCADE,
 invitation_id uuid NOT NULL REFERENCES forena.invitation,
 invitation_revision bigint NOT NULL, activity_revision bigint NOT NULL,
 message_id bigint, last_update bigint NOT NULL DEFAULT -1,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sent','failed','uncertain')),
 next_attempt timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX telegram_invitation_due ON forena.telegram_invitation(next_attempt,id) WHERE state='pending';
-- Existing audit records remain immutable. New channels are explicit, never inferred from model text.
ALTER TABLE forena.invitation_history DROP CONSTRAINT IF EXISTS invitation_history_channel_check;
ALTER TABLE forena.invitation_history ADD CONSTRAINT invitation_history_channel_check CHECK(channel IN ('web','telegram'));
ALTER TABLE forena.invitation_notification ADD COLUMN activity_revision bigint;
ALTER TABLE forena.invitation_notification ADD COLUMN invitation_revision bigint;
ALTER TABLE forena.team_permission_assignment DROP CONSTRAINT team_permission_assignment_permission_check;
ALTER TABLE forena.team_permission_assignment ADD CONSTRAINT team_permission_assignment_permission_check
 CHECK(permission IN ('activity.manage','invitation.manage','roster.manage','attendance.manage','assistant.memory.manage'));
ALTER TABLE forena.person ADD COLUMN birth_date date;
CREATE TABLE forena.telegram_transport_state(id boolean PRIMARY KEY CHECK(id), paused_until timestamptz NOT NULL DEFAULT '-infinity');
INSERT INTO forena.telegram_transport_state(id) VALUES(true);
ALTER TABLE forena.activity ADD COLUMN source_kind text NOT NULL DEFAULT 'manual' CHECK(source_kind IN ('manual','imported'));
ALTER TABLE forena.activity ADD COLUMN external_source text;
ALTER TABLE forena.activity ADD COLUMN venue text CHECK(venue IN ('home','away','neutral'));
CREATE TABLE forena.activity_duty (
 id uuid PRIMARY KEY, activity_id uuid NOT NULL, organization_id uuid NOT NULL,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
 instructions text NOT NULL CHECK(length(instructions)<=2000),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','cancelled','completed')),
 created_by uuid NOT NULL REFERENCES forena.account, revision bigint NOT NULL DEFAULT 1,
 FOREIGN KEY(activity_id,organization_id) REFERENCES forena.activity(id,organization_id)
);
CREATE UNIQUE INDEX activity_duty_name ON forena.activity_duty(activity_id,lower(name));
CREATE TABLE forena.activity_duty_place (
 id uuid PRIMARY KEY, duty_id uuid NOT NULL REFERENCES forena.activity_duty,
 number integer NOT NULL CHECK(number BETWEEN 1 AND 50),
 person_id uuid REFERENCES forena.person, completed boolean NOT NULL DEFAULT false,
 UNIQUE(duty_id,number)
);
CREATE TABLE forena.activity_duty_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), duty_id uuid NOT NULL REFERENCES forena.activity_duty,
 actor_subject uuid NOT NULL REFERENCES forena.account, operation text NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE forena.assistant_memory ADD CONSTRAINT assistant_memory_section_club
 FOREIGN KEY(section_id,organization_id) REFERENCES forena.section(id,organization_id);
ALTER TABLE forena.assistant_memory ADD CONSTRAINT assistant_memory_team_club
 FOREIGN KEY(team_id,organization_id) REFERENCES forena.team(id,organization_id);
ALTER TABLE forena.assistant_proposal ADD CONSTRAINT assistant_proposal_team_club
 FOREIGN KEY(team_id,organization_id) REFERENCES forena.team(id,organization_id);
CREATE TABLE forena.assistant_routed_question (
 id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES forena.assistant_conversation ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES forena.organization,
 content text NOT NULL CHECK(length(content)<=4000), created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX assistant_routed_question_context ON forena.assistant_routed_question(conversation_id,organization_id,created_at,id);
ALTER TABLE forena.assistant_memory ADD COLUMN revision bigint NOT NULL DEFAULT 1;
CREATE TABLE forena.assistant_memory_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), memory_id uuid NOT NULL,
 actor_subject uuid NOT NULL REFERENCES forena.account, operation text NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE forena.invitation_email ADD COLUMN delivered_via text CHECK(delivered_via IN ('telegram','push','email'));
CREATE TABLE forena.push_subscription (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject uuid NOT NULL REFERENCES forena.account,
 endpoint text NOT NULL UNIQUE, p256dh text NOT NULL, auth text NOT NULL,
 active boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX push_subscription_subject ON forena.push_subscription(subject) WHERE active;
CREATE TABLE forena.push_delivery (
 notification_id uuid NOT NULL REFERENCES forena.invitation_notification,
 subscription_id uuid NOT NULL REFERENCES forena.push_subscription,
 state text NOT NULL CHECK(state IN ('uncertain','accepted','failed')),
 PRIMARY KEY(notification_id,subscription_id)
);
CREATE TABLE forena.assistant_document (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES forena.organization,
 section_id uuid, team_id uuid, title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
 content text NOT NULL CHECK(length(content)<=12000), audience text NOT NULL CHECK(audience IN ('all','players','guardians','leaders')),
 FOREIGN KEY(section_id,organization_id) REFERENCES forena.section(id,organization_id),
 FOREIGN KEY(team_id,organization_id) REFERENCES forena.team(id,organization_id)
);
CREATE INDEX assistant_document_scope ON forena.assistant_document(organization_id,section_id,team_id);
