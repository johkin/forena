import { NextResponse } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type ManagedActivity = Pick<Database["public"]["Tables"]["activities"]["Row"], "id" | "organization_id" | "activity_type_id" | "starts_at" | "status"> & { team_id: string };
type Context = { error: NextResponse } | { supabase: Awaited<ReturnType<typeof createClient>>; activity: ManagedActivity };

export async function activityManagementContext(activityId: string): Promise<Context> {
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) return { error: NextResponse.json({ error: "Du måste logga in" }, { status: 401 }) };
  const { data: activity } = await supabase.from("activities").select("id, organization_id, team_id, activity_type_id, starts_at, status").eq("id", activityId).maybeSingle();
  if (!activity?.team_id) return { error: NextResponse.json({ error: "Aktiviteten kunde inte hittas" }, { status: 404 }) };
  const { data: allowed, error: permissionError } = await supabase.rpc("has_team_permission", { target_team_id: activity.team_id, target_permission: "invitation.manage" });
  if (permissionError || !allowed) return { error: NextResponse.json({ error: "Du saknar behörighet för laget" }, { status: 403 }) };
  return { supabase, activity: { ...activity, team_id: activity.team_id } };
}
