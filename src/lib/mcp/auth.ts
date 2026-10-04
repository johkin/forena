import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import type { AssistantDependencies } from "@/lib/ai/team-assistant-types";

/** MCP credentials never fall back to browser cookies or privileged clients. */
export async function authenticateMcp(request: Request): Promise<AssistantDependencies | null> {
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) return null;
  const { url, publishableKey } = getSupabaseEnvironment();
  const supabase = createClient<Database>(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.auth.getClaims(match[1]);
  if (error || data?.claims.role !== "authenticated" || typeof data.claims.sub !== "string") return null;
  const { data: userData, error: userError } = await supabase.auth.getUser(match[1]);
  if (userError || !userData.user || userData.user.id !== data.claims.sub) return null;
  return { supabase, userId: userData.user.id };
}
