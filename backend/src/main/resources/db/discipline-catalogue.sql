CREATE TABLE forena.discipline_category (key text PRIMARY KEY, name text NOT NULL);
INSERT INTO forena.discipline_category VALUES('sport','Idrott'),('other','Övrigt'),('culture','Kultur'),('outdoor','Friluftsliv'),('game','Spel');
CREATE TABLE forena.discipline_catalogue (key text PRIMARY KEY, name text NOT NULL,
 category_key text NOT NULL REFERENCES forena.discipline_category, code_owned boolean NOT NULL DEFAULT false);
INSERT INTO forena.discipline_catalogue VALUES('common','Allmän verksamhet','other',true),('football','Fotboll','sport',true);
INSERT INTO forena.discipline_catalogue(key,name,category_key)
 SELECT DISTINCT discipline_key,discipline_key,'other' FROM forena.section
 WHERE discipline_key NOT IN ('common','football');
ALTER TABLE forena.section ADD FOREIGN KEY(discipline_key) REFERENCES forena.discipline_catalogue(key);
CREATE TABLE forena.discipline_catalogue_audit(id uuid PRIMARY KEY, actor_subject uuid NOT NULL REFERENCES forena.account,
 operation text NOT NULL, target_key text NOT NULL, changed_at timestamptz NOT NULL DEFAULT current_timestamp);
CREATE TABLE forena.discipline_catalogue_lock(id boolean PRIMARY KEY CHECK(id));
INSERT INTO forena.discipline_catalogue_lock VALUES(true);
CREATE TABLE forena.activity_defaults_audit(id uuid PRIMARY KEY,defaults_id uuid NOT NULL REFERENCES forena.activity_defaults,
 actor_subject uuid NOT NULL REFERENCES forena.account,revision bigint NOT NULL,changed_at timestamptz NOT NULL DEFAULT current_timestamp,
 UNIQUE(defaults_id,revision));
