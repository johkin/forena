#!/bin/sh
set -eu
# Vercel project variables are shared by services. Do not pass integration,
# database, migration, probe or Auth-admin credentials to the web process.
exec env -i \
  PATH="$PATH" NODE_ENV=production HOSTNAME=0.0.0.0 PORT="${PORT:-80}" \
  NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:?}" \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:?}" \
  SITE_URL="${SITE_URL:?}" FORENA_PARTICIPATION_BACKEND=kotlin \
  FORENA_KOTLIN_SERVICE_URL="${FORENA_KOTLIN_SERVICE_URL:?Service binding is required}" \
  FORENA_KOTLIN_TEST_ACTIVITY_ID="${FORENA_KOTLIN_TEST_ACTIVITY_ID:-}" \
  node server.js
