import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type AudienceRole = "participant" | "leader";
export type AudienceSelection = { roles: AudienceRole[]; groupIds: string[]; responsibilityTypeIds: string[] };

export function parseAudienceSelection(input: unknown): AudienceSelection {
  if (!input || typeof input !== "object") throw new Error("Välj minst en målgrupp.");
  const value = input as Record<string, unknown>;
  const responsibilityTypeIdsInput = value.responsibilityTypeIds ?? [];
  if (!Array.isArray(value.roles) || !Array.isArray(value.groupIds) || !Array.isArray(responsibilityTypeIdsInput) ||
      value.roles.some((role) => !["participant", "leader"].includes(role)) ||
      value.groupIds.some((id) => typeof id !== "string") ||
      responsibilityTypeIdsInput.some((id: unknown) => typeof id !== "string")) throw new Error("Ogiltig målgrupp.");
  const roles = [...new Set(value.roles)] as AudienceRole[];
  const groupIds = [...new Set(value.groupIds)] as string[];
  const responsibilityTypeIds = [...new Set(responsibilityTypeIdsInput as string[])];
  if (!roles.length && !groupIds.length && !responsibilityTypeIds.length) throw new Error("Välj minst en målgrupp.");
  return { roles, groupIds, responsibilityTypeIds };
}

export async function validateAudienceSelection(
  supabase: SupabaseClient<Database>, teamId: string, input: unknown,
): Promise<AudienceSelection> {
  const { roles, groupIds, responsibilityTypeIds } = parseAudienceSelection(input);
  if (groupIds.length) {
    const { data, error } = await supabase.from("team_groups").select("id").eq("team_id", teamId).in("id", groupIds);
    if (error || data?.length !== groupIds.length) throw new Error("En vald undergrupp tillhör inte laget.");
  }
  if (responsibilityTypeIds.length) {
    const { data, error } = await supabase
      .from("team_responsibilities")
      .select("responsibility_type_id")
      .eq("team_id", teamId)
      .in("responsibility_type_id", responsibilityTypeIds)
      .lte("starts_on", new Date().toISOString().slice(0, 10))
      .or(`ends_on.is.null,ends_on.gte.${new Date().toISOString().slice(0, 10)}`);
    const active = new Set((data ?? []).map((item) => item.responsibility_type_id));
    if (error || responsibilityTypeIds.some((id) => !active.has(id))) throw new Error("En vald lagroll är inte aktiv i laget.");
  }
  return { roles, groupIds, responsibilityTypeIds };
}
