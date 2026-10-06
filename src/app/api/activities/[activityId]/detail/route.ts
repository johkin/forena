import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Activity, Organization, Team } from "@/domain/club";

export async function GET(_request: Request, { params }: { params: Promise<{ activityId: string }> }) {
  const { activityId } = await params;
  if (!z.uuid().safeParse(activityId).success) return NextResponse.json({ error: "Aktiviteten kunde inte hittas." }, { status: 404 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Du måste logga in." }, { status: 401 });
  // Caller credentials and RLS apply; never use a service client for modal data.
  const { data: a, error } = await supabase.from("activities").select("id, organization_id, team_id, activity_type_id, title, description_markdown, starts_at, ends_at, gathering_at, location, status, series_id, response_due_at").eq("id", activityId).maybeSingle();
  if (error || !a?.team_id) return NextResponse.json({ error: "Aktiviteten kunde inte hittas." }, { status: 404 });
  const permissions = await Promise.all(["team.view", "attendance.manage", "invitation.manage"].map(target_permission => supabase.rpc("has_team_permission", { target_team_id: a.team_id!, target_permission })));
  if (!permissions.some(result => !result.error && result.data === true)) return NextResponse.json({ error: "Du saknar behörighet för laget." }, { status: 403 });
  const [{ data: o }, { data: t }] = await Promise.all([
    supabase.from("organizations").select("id, slug, name, time_zone, assistant_name").eq("id", a.organization_id).single(),
    supabase.from("teams").select("id, slug, name, organization_id, section_id, season").eq("id", a.team_id).eq("organization_id", a.organization_id).single(),
  ]);
  if (!o || !t) return NextResponse.json({ error: "Aktiviteten kunde inte hittas." }, { status: 404 });
  const activity: Activity = { id: a.id, organizationId: a.organization_id, teamId: t.id, activityTypeId: a.activity_type_id, title: a.title, description: a.description_markdown, startsAt: a.starts_at, endsAt: a.ends_at, gatheringAt: a.gathering_at ?? undefined, location: a.location, status: a.status, seriesId: a.series_id ?? undefined, responseDueAt: a.response_due_at ?? undefined };
  const organization: Organization = { id: o.id, slug: o.slug, name: o.name, assistantName: o.assistant_name, timeZone: o.time_zone };
  const team: Team = { id: t.id, slug: t.slug, name: t.name, organizationId: t.organization_id, sectionId: t.section_id, season: t.season };
  return NextResponse.json({ activity, organization, team }, { headers: { "Cache-Control": "private, no-store" } });
}
