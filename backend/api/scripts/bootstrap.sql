-- Run once as a database administrator against a NEW database, not the old Förena database.
-- No passwords here. Set credentials through the platform's secret administration afterwards.
CREATE ROLE forena_api_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE forena_api_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE SCHEMA forena AUTHORIZATION forena_api_owner;
REVOKE ALL ON SCHEMA forena FROM PUBLIC;
-- Only the release job receives the owner credential. Runtime must NEVER be a member
-- of that role. Do not expose `forena` in the Data API.
