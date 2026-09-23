import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ activityId: string }> };

export async function PUT(request: Request, { params }: Props) {
  const { activityId } = await params;
  const body = await request.json().catch(() => null) as { title?: string; description?: string; gatheringAt?: string | null; startsAt?: string; endsAt?: string; location?: string } | null;
  const title = body?.title?.trim();
  const startsAt = body?.startsAt ? new Date(body.startsAt) : null;
  const endsAt = body?.endsAt ? new Date(body.endsAt) : null;
  const gatheringAt = body?.gatheringAt ? new Date(body.gatheringAt) : null;
  if (!title || !startsAt || !endsAt || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt || (gatheringAt && gatheringAt > startsAt)) {
    return NextResponse.json({ error: "Ogiltiga aktivitetsuppgifter" }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Du måste logga in" }, { status: 401 });
  const { data: current } = await supabase.from("activities").select("id, team_id, status, source_kind").eq("id", activityId).maybeSingle();
  if (!current?.team_id) return NextResponse.json({ error: "Aktiviteten kunde inte hittas" }, { status: 404 });
  const { data: allowed } = await supabase.rpc("can_manage_team", { target_team_id: current.team_id });
  if (!allowed) return NextResponse.json({ error: "Du saknar behörighet för laget" }, { status: 403 });
  if (current.source_kind === "imported") return NextResponse.json({ error: "Importerade aktiviteter måste ändras i källsystemet" }, { status: 409 });
  if (current.status === "cancelled") return NextResponse.json({ error: "En inställd aktivitet kan inte redigeras" }, { status: 409 });
  const { data: activity, error } = await supabase.from("activities").update({ title, description_markdown: body?.description?.trim() ?? "", gathering_at: gatheringAt?.toISOString() ?? null, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), location: body?.location?.trim() ?? "" }).eq("id", activityId).select("id, organization_id, team_id, title, gathering_at, starts_at, ends_at, location, series_id, status").single();
  if (error || !activity) return NextResponse.json({ error: "Aktiviteten kunde inte uppdateras" }, { status: 500 });
  return NextResponse.json({ activity });
}

export async function DELETE(request: Request, { params }: Props) {
  const { activityId } = await params;
  const body = await request.json().catch(() => null) as { reason?: string } | null;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Du måste logga in" }, { status: 401 });
  const { data: activity } = await supabase.from("activities").select("id, team_id, status, source_kind").eq("id", activityId).maybeSingle();
  if (!activity?.team_id) return NextResponse.json({ error: "Aktiviteten kunde inte hittas" }, { status: 404 });
  const { data: allowed } = await supabase.rpc("can_manage_team", { target_team_id: activity.team_id });
  if (!allowed) return NextResponse.json({ error: "Du saknar behörighet för laget" }, { status: 403 });
  if (activity.source_kind === "imported") return NextResponse.json({ error: "Importerade aktiviteter måste tas bort i källsystemet" }, { status: 409 });
  const { count } = await supabase.from("invitations").select("id", { count: "exact", head: true }).eq("activity_id", activityId).neq("response", "pending");
  if (activity.status === "draft" || !count) {
    const { error } = await supabase.from("activities").delete().eq("id", activityId);
    if (error) return NextResponse.json({ error: "Aktiviteten kunde inte tas bort" }, { status: 500 });
    return NextResponse.json({ disposition: "deleted" });
  }
  const { error } = await supabase.from("activities").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancellation_reason: body?.reason?.trim() || "Inställd av ledare" }).eq("id", activityId);
  if (error) return NextResponse.json({ error: "Aktiviteten kunde inte ställas in" }, { status: 500 });
  return NextResponse.json({ disposition: "cancelled" });
}
