-- ONLY forena-kotlin. Setup required the absence of an earlier override.
-- Remove exposure BEFORE dropping its schema. Run reset + notifications as one
-- committed operation, confirm HTTP rejects the fixture, THEN run the DROP below.
ALTER ROLE authenticator RESET pgrst.db_schemas;
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
-- In a SECOND committed operation, after HTTP confirmation:
-- DROP SCHEMA forena_probe_api_check CASCADE;
-- Delete only net queue/response IDs recorded by this probe; never blanket-delete.
