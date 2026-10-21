-- Run once in the clean target, never the old Förena database.
-- Existing isolated probe schemas may coexist; `forena` must not already exist.
-- Provision disabled roles first. Set distinct credentials through secret administration,
-- then explicitly enable LOGIN when the migration/release is ready.
CREATE ROLE forena_api_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE forena_api_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
-- Managed PostgreSQL's CREATEROLE is not superuser. Temporarily allow the
-- creating administrator to assign the schema owner; retain only role administration.
GRANT forena_api_owner TO CURRENT_USER WITH SET TRUE, INHERIT FALSE;
CREATE SCHEMA forena AUTHORIZATION forena_api_owner;
GRANT forena_api_owner TO CURRENT_USER WITH SET FALSE, INHERIT FALSE;
REVOKE ALL ON SCHEMA forena FROM PUBLIC;
-- The startup migrator uses a separate owner credential. The runtime SQL role
-- must NEVER be a member of that role. Do not expose `forena` in the Data API.
