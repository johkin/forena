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

  const { data: groups, error } = await supabase
    .from("team_groups")
    .select("id, name")
    .eq("team_id", teamId)
    .order("name");
  if (error) return NextResponse.json({ error: "Undergrupperna kunde inte hämtas" }, { status: 500 });
  return NextResponse.json({ groups: groups ?? [] });
}
