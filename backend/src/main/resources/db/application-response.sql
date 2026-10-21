-- ADR-013: all invitation response behavior is implemented by Spring Boot services.
-- Preserve previous change sets and data; replace trigger ownership with explicit repositories.
DROP TRIGGER invitation_guard ON forena.invitation;
DROP TRIGGER invitation_record ON forena.invitation;
DROP FUNCTION forena.guard_response();
DROP FUNCTION forena.record_response();

-- Immutable invitation identity and history remain protected by narrow grants.
GRANT UPDATE(responded_at,revision) ON forena.invitation TO forena_api_runtime;
GRANT INSERT ON forena.invitation_history TO forena_api_runtime;
GRANT SELECT,INSERT ON forena.activity_signal_state TO forena_api_runtime;
GRANT UPDATE(dirty_revision,changed_at) ON forena.activity_signal_state TO forena_api_runtime;
-- PostgreSQL SELECT FOR UPDATE requires UPDATE on at least one column. The repository
-- exposes only reads/locking; this privilege is needed to lock concurrent lifecycle edits.
GRANT UPDATE(status) ON forena.activity TO forena_api_runtime;
