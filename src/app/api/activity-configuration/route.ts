import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadActivityConfiguration } from "@/lib/activity-configuration";
import { isUuid } from "@/lib/ai/assistant-memory-draft";

export async function GET(request: Request) {
  const teamId = new URL(request.url).searchParams.get("teamId");
  if (!teamId || !isUuid(teamId)) return NextResponse.json({ error: "Ogiltigt lag." }, { status: 400 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Logga in." }, { status: 401 });
  const { data: allowed, error } = await supabase.rpc("has_team_permission", { target_team_id: teamId, target_permission: "activity.manage" });
  if (error || !allowed) return NextResponse.json({ error: "Du saknar behörighet." }, { status: 403 });
  try { return NextResponse.json(await loadActivityConfiguration(supabase, teamId), { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return NextResponse.json({ error: "Aktivitetsinställningarna kunde inte hämtas." }, { status: 500 }); }
}
