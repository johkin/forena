-- Kotlin authorizes person IDs before this read-only overview projection.
GRANT SELECT(id, organization_id, name) ON forena.team TO forena_api_runtime;
