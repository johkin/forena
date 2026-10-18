CREATE TABLE probe_run (
 id uuid PRIMARY KEY,
 delay_ms bigint NOT NULL CHECK(delay_ms BETWEEN 0 AND 90000),
 mode text NOT NULL CHECK(mode IN ('NORMAL','BLOCK','CRASH')),
 requested_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE probe_release (id uuid PRIMARY KEY REFERENCES probe_run(id));
CREATE TABLE probe_attempt (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 run_id uuid NOT NULL REFERENCES probe_run(id),
 instance_id text NOT NULL,
 started_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE probe_effect (
 id uuid PRIMARY KEY REFERENCES probe_run(id),
 instance_id text NOT NULL,
 completed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE probe_receipt (
 id uuid PRIMARY KEY REFERENCES probe_run(id),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON ALL TABLES IN SCHEMA forena_probe FROM PUBLIC;
