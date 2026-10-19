#!/bin/sh
set -eu
# This release target is the new isolated project, never the legacy database.
test "${FORENA_DB_USERNAME:-}" = forena_api_runtime.ckzrtxqjskosqzoitymc || {
  echo 'forena_api_startup_failed: invalid runtime username' >&2; exit 1;
}
test "${FORENA_JDBC_URL:-}" = 'jdbc:postgresql://aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=/app/supabase-ca.crt' || {
  echo 'forena_api_startup_failed: invalid JDBC configuration' >&2; exit 1;
}
# Migration is a separate release operation. Project-level Spring overrides,
# owner/admin credentials and probe settings never reach the API process.
echo 'forena_api_startup: starting JVM' >&2
exec env -i \
  PATH=/opt/java/bin:/usr/bin:/bin PORT="${PORT:-80}" \
  FORENA_JDBC_URL="${FORENA_JDBC_URL:?}" \
  FORENA_DB_USERNAME="${FORENA_DB_USERNAME:?}" \
  FORENA_DB_PASSWORD="${FORENA_DB_PASSWORD:?}" \
  FORENA_AUTH_ISSUER=https://ckzrtxqjskosqzoitymc.supabase.co/auth/v1 \
  FORENA_AUTH_JWKS_URI=https://ckzrtxqjskosqzoitymc.supabase.co/auth/v1/.well-known/jwks.json \
  FORENA_AUTH_PUBLISHABLE_KEY="${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:?}" \
  FORENA_AUTH_CA_BUNDLE="${SSL_CERT_FILE:-}" \
  FORENA_AUTH_EXTRA_CA_BUNDLE="${NODE_EXTRA_CA_CERTS:-}" \
  FORENA_MIGRATE=false \
  /opt/java/bin/java -jar /app/forena-api.jar
