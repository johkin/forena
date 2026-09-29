import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type AudienceRole = "participant" | "leader" | "volunteer";
export type AudienceSelection = { roles: AudienceRole[]; groupIds: string[] };

export function parseAudienceSelection(input: unknown): AudienceSelection {
  if (!input || typeof input !== "object") throw new Error("Välj minst en målgrupp.");
  const value = input as Record<string, unknown>;
  if (!Array.isArray(value.roles) || !Array.isArray(value.groupIds) ||
      value.roles.some((role) => !["participant", "leader", "volunteer"].includes(role)) ||
      value.groupIds.some((id) => typeof id !== "string")) throw new Error("Ogiltig målgrupp.");
  const roles = [...new Set(value.roles)] as AudienceRole[];
  const groupIds = [...new Set(value.groupIds)] as string[];
  if (!roles.length && !groupIds.length) throw new Error("Välj minst en målgrupp.");
  return { roles, groupIds };
}

export async function validateAudienceSelection(
  supabase: SupabaseClient<Database>, teamId: string, input: unknown,
): Promise<AudienceSelection> {
  const { roles, groupIds } = parseAudienceSelection(input);
  if (groupIds.length) {
    const { data, error } = await supabase.from("team_groups").select("id").eq("team_id", teamId).in("id", groupIds);
    if (error || data?.length !== groupIds.length) throw new Error("En vald undergrupp tillhör inte laget.");
  }
  return { roles, groupIds };
}
