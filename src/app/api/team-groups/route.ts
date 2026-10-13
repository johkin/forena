import { loadTeamSelectionGroups } from "@/lib/team-selection-groups";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Return authorized team audiences and deduplicated subgroup member IDs. */
export async function GET(request: Request) {
  const teamId = new URL(request.url).searchParams.get("teamId");
  if (!teamId) return NextResponse.json({ error: "Lag saknas" }, { status: 400 });

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Du måste logga in" }, { status: 401 });

  const { data: allowed } = await supabase.rpc("has_team_permission", { target_team_id: teamId, target_permission: "team.view" });
  if (!allowed) return NextResponse.json({ error: "Du saknar behörighet för laget" }, { status: 403 });

  const today = new Date().toISOString().slice(0, 10);
  const [groupResult, { data: assignments, error: assignmentError }] = await Promise.all([
    loadTeamSelectionGroups(supabase, teamId).then(groups => ({ groups, error: false })).catch(() => ({ groups: [], error: true })),
    supabase
      .from("team_responsibilities")
      .select("responsibility_type_id")
      .eq("team_id", teamId)
      .lte("starts_on", today)
      .or(`ends_on.is.null,ends_on.gte.${today}`),
  ]);
  if (groupResult.error || assignmentError) return NextResponse.json({ error: "Målgrupperna kunde inte hämtas" }, { status: 500 });

  const responsibilityTypeIds = [...new Set((assignments ?? []).map((item) => item.responsibility_type_id))];
  const { data: responsibilityTypes, error: responsibilityError } = responsibilityTypeIds.length
    ? await supabase.from("responsibility_types").select("id, name").in("id", responsibilityTypeIds).order("name")
    : { data: [], error: null };
  if (responsibilityError) return NextResponse.json({ error: "Lagrollerna kunde inte hämtas" }, { status: 500 });

  return NextResponse.json({
    groups: groupResult.groups,
    responsibilities: responsibilityTypes ?? [],
  });
}
