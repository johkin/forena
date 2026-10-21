-- Runtime is the trusted data role; Kotlin owns all end-user authorization.
-- Liquibase/DDL runs separately as the schema owner, never as runtime.
GRANT USAGE ON SCHEMA forena TO forena_api_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA forena TO forena_api_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA forena TO forena_api_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE forena_api_owner IN SCHEMA forena
 GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO forena_api_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE forena_api_owner IN SCHEMA forena
 GRANT USAGE, SELECT ON SEQUENCES TO forena_api_runtime;
-- Migration bookkeeping is not application data.
REVOKE ALL ON forena.databasechangelog, forena.databasechangeloglock FROM forena_api_runtime;
