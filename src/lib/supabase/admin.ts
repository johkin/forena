import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getSupabaseEnvironment } from "./env";

export function createAdminClient() {
  const { url } = getSupabaseEnvironment();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!secretKey || secretKey.startsWith("replace-")) {
    throw new Error("SUPABASE_SECRET_KEY saknas för serveradministration.");
  }

  return createSupabaseClient<Database>(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
