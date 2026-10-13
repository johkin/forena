import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

/** Call only after checking team access, using the authenticated RLS client. */
export async function loadTeamSelectionGroups(supabase: SupabaseClient<Database>, teamId: string) {
  const { data: groups, error } = await supabase.from("team_groups").select("id, name").eq("team_id", teamId).order("name");
  if (error) throw new Error("Undergrupperna kunde inte hämtas");
  if (!groups?.length) return [];
  const { data: members, error: memberError } = await supabase.from("team_group_members").select("group_id, person_id").in("group_id", groups.map(group => group.id));
  if (memberError) throw new Error("Undergruppernas medlemmar kunde inte hämtas");
  return groups.map(group => ({ ...group, personIds: [...new Set((members ?? []).filter(member => member.group_id === group.id).map(member => member.person_id))] }));
}
