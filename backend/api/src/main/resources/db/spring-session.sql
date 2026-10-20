-- Standard Spring Session JDBC 4.1 PostgreSQL schema, owned through Liquibase.
create table forena.spring_session (
	primary_id char(36) not null,
	session_id char(36) not null,
	creation_time bigint not null,
	last_access_time bigint not null,
	max_inactive_interval int not null,
	expiry_time bigint not null,
	principal_name varchar(100),
	constraint spring_session_pk primary key (primary_id)
);

create unique index spring_session_ix1 on forena.spring_session (session_id);
create index spring_session_ix2 on forena.spring_session (expiry_time);
create index spring_session_ix3 on forena.spring_session (principal_name);

create table forena.spring_session_attributes (
	session_primary_id char(36) not null,
	attribute_name varchar(200) not null,
	attribute_bytes bytea not null,
	constraint spring_session_attributes_pk primary key (session_primary_id, attribute_name),
	constraint spring_session_attributes_fk foreign key (session_primary_id) references forena.spring_session(primary_id) on delete cascade
);

-- Keep the legacy browser_session table intact for a reversible rollout.
REVOKE ALL ON forena.spring_session, forena.spring_session_attributes FROM PUBLIC;
DO $$
DECLARE client_role text;
BEGIN
 FOR client_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON forena.spring_session, forena.spring_session_attributes FROM %I', client_role);
 END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON forena.spring_session, forena.spring_session_attributes TO forena_api_runtime;
