-- Only current state is stored. Suggestions and previous scores are never persisted.
CREATE TABLE forena.player_evaluation (
 team_id uuid PRIMARY KEY REFERENCES forena.team(id),
 revision uuid NOT NULL,
 default_groups integer NOT NULL CHECK(default_groups>=2),
 threshold double precision NOT NULL CHECK(threshold>=0 AND threshold<=10)
);
CREATE TABLE forena.player_evaluation_metric (
 id uuid PRIMARY KEY, team_id uuid NOT NULL REFERENCES forena.player_evaluation(team_id) ON DELETE CASCADE,
 name varchar(100) NOT NULL CHECK(length(trim(name))>0),
 kind varchar(20) NOT NULL CHECK(kind IN ('ability','development')),
 UNIQUE(team_id,id)
);
CREATE TABLE forena.player_evaluation_score (
 team_id uuid NOT NULL, metric_id uuid NOT NULL, person_id uuid NOT NULL REFERENCES forena.person(id),
 score integer NOT NULL CHECK(score BETWEEN 0 AND 10),
 PRIMARY KEY(team_id,metric_id,person_id),
 FOREIGN KEY(team_id,metric_id) REFERENCES forena.player_evaluation_metric(team_id,id) ON DELETE CASCADE
);
CREATE INDEX player_evaluation_score_person ON forena.player_evaluation_score(person_id);
