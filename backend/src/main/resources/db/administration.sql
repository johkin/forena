ALTER TABLE forena.organization ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE forena.organization ADD COLUMN slug text;
CREATE UNIQUE INDEX organization_slug ON forena.organization(slug) WHERE slug IS NOT NULL;
ALTER TABLE forena.section ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE forena.section ADD COLUMN slug text;
CREATE UNIQUE INDEX section_slug ON forena.section(organization_id,slug) WHERE slug IS NOT NULL;
ALTER TABLE forena.team ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE forena.team ADD COLUMN slug text;
ALTER TABLE forena.team ADD COLUMN season text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX team_slug ON forena.team(organization_id,slug) WHERE slug IS NOT NULL;
CREATE TABLE forena.administration_state(id boolean PRIMARY KEY CHECK(id), initialized boolean NOT NULL DEFAULT false);
INSERT INTO forena.administration_state(id) VALUES(true);
CREATE TABLE forena.platform_administrator (
 subject uuid PRIMARY KEY REFERENCES forena.account, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE forena.section_administrator (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, section_id uuid NOT NULL,
 subject uuid NOT NULL REFERENCES forena.account, active boolean NOT NULL DEFAULT true,
 FOREIGN KEY(section_id,organization_id) REFERENCES forena.section(id,organization_id), UNIQUE(section_id,subject)
);
CREATE TABLE forena.team_administrator (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, team_id uuid NOT NULL,
 subject uuid NOT NULL REFERENCES forena.account, person_id uuid NOT NULL,
 access_assignment_id uuid NOT NULL REFERENCES forena.team_access_assignment,
 starts_on date NOT NULL, ends_on date, active boolean NOT NULL DEFAULT true,
 CHECK(ends_on IS NULL OR ends_on>=starts_on),
 FOREIGN KEY(team_id,organization_id) REFERENCES forena.team(id,organization_id),
 FOREIGN KEY(person_id,organization_id) REFERENCES forena.person(id,organization_id), UNIQUE(team_id,subject)
);
CREATE TABLE forena.administration_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_subject uuid NOT NULL REFERENCES forena.account,
 operation text NOT NULL, target_id uuid NOT NULL, target_subject uuid REFERENCES forena.account,
 channel text NOT NULL DEFAULT 'web' CHECK(channel='web'), correlation_id uuid NOT NULL DEFAULT gen_random_uuid(), changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX section_administrator_subject ON forena.section_administrator(subject,section_id) WHERE active;
CREATE INDEX team_administrator_subject ON forena.team_administrator(subject,team_id) WHERE active;
CREATE INDEX administration_audit_target ON forena.administration_audit(target_id,changed_at);
ALTER TABLE forena.organization ADD CONSTRAINT organization_slug_format CHECK(slug IS NULL OR (length(slug) BETWEEN 1 AND 120 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'));
ALTER TABLE forena.section ADD CONSTRAINT section_slug_format CHECK(slug IS NULL OR (length(slug) BETWEEN 1 AND 120 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'));
ALTER TABLE forena.team ADD CONSTRAINT team_slug_format CHECK(slug IS NULL OR (length(slug) BETWEEN 1 AND 120 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'));
