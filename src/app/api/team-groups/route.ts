import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const teamId = new URL(request.url).searchParams.get("teamId");
  if (!teamId) return NextResponse.json({ error: "Lag saknas" }, { status: 400 });

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Du måste logga in" }, { status: 401 });

  const { data: allowed } = await supabase.rpc("can_manage_team", { target_team_id: teamId });
  if (!allowed) return NextResponse.json({ error: "Du saknar behörighet för laget" }, { status: 403 });

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: groups, error: groupError }, { data: responsibilities, error: responsibilityError }] = await Promise.all([
    supabase.from("team_groups").select("id, name").eq("team_id", teamId).order("name"),
    supabase
      .from("team_responsibilities")
      .select("responsibility_type_id, responsibility_types(id, name)")
      .eq("team_id", teamId)
      .lte("starts_on", today)
      .or(`ends_on.is.null,ends_on.gte.${today}`),
  ]);
  if (groupError || responsibilityError) return NextResponse.json({ error: "Målgrupperna kunde inte hämtas" }, { status: 500 });

  const roleMap = new Map<string, string>();
  for (const item of responsibilities ?? []) {
    const type = Array.isArray(item.responsibility_types) ? item.responsibility_types[0] : item.responsibility_types;
    if (type?.id && type?.name) roleMap.set(type.id, type.name);
  }

  return NextResponse.json({
    groups: groups ?? [],
    responsibilities: [...roleMap].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "sv")),
  });
}
