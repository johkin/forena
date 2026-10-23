-- Only mounted by the local development Compose file, after bootstrap.sql.
ALTER ROLE forena_api_owner LOGIN PASSWORD 'local-owner-only';
ALTER ROLE forena_api_runtime LOGIN PASSWORD 'local-runtime-only';
