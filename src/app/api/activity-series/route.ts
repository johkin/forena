import { NextResponse } from "next/server";
import { previewWeeklySeries, type SeriesPreviewInput } from "@/lib/activity-series";
import { createClient } from "@/lib/supabase/server";

type CreateSeriesBody = SeriesPreviewInput & {
  teamId?: string;
  activityTypeId?: string;
  title?: string;
  description?: string;
  location?: string;
  personIds?: string[];
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as CreateSeriesBody | null;
  const title = body?.title?.trim();
  if (!body?.teamId || !title || !body.startsOn || !body.endsOn || !body.startTime || !body.timeZone) {
    return NextResponse.json({ error: "Ogiltiga uppgifter för aktivitetsserien" }, { status: 400 });
  }
  let occurrences;
  try {
    occurrences = previewWeeklySeries(body);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Serien kunde inte beräknas" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Du måste logga in" }, { status: 401 });
  const { data: team } = await supabase.from("teams").select("id, organization_id").eq("id", body.teamId).maybeSingle();
  if (!team) return NextResponse.json({ error: "Laget kunde inte hittas" }, { status: 404 });
  const { data: allowed } = await supabase.rpc("can_manage_team", { target_team_id: team.id });
  if (!allowed) return NextResponse.json({ error: "Du saknar behörighet för laget" }, { status: 403 });

  const typeQuery = supabase.from("activity_types").select("id").eq("organization_id", team.organization_id).eq("active", true);
  const { data: activityType } = body.activityTypeId
    ? await typeQuery.eq("id", body.activityTypeId).maybeSingle()
    : await typeQuery.eq("slug", "ovrigt").maybeSingle();
  if (!activityType) return NextResponse.json({ error: "Aktivitetstypen kunde inte hittas" }, { status: 400 });

  const personIds = [...new Set(body.personIds ?? [])];
  const { data: memberships } = personIds.length
    ? await supabase.from("memberships").select("person_id").eq("team_id", team.id).eq("role", "participant").is("ends_on", null).in("person_id", personIds)
    : { data: [] };
  if ((memberships ?? []).length !== personIds.length) return NextResponse.json({ error: "En eller flera deltagare tillhör inte laget" }, { status: 400 });

  const recurrenceRule = { frequency: "weekly", weekdays: body.weekdays, startTime: body.startTime, durationMinutes: body.durationMinutes, gatheringMinutesBefore: body.gatheringMinutesBefore, timeZone: body.timeZone };
  const { data: series, error: seriesError } = await supabase.from("activity_series").insert({
    organization_id: team.organization_id, team_id: team.id, activity_type_id: activityType.id, title,
    location: body.location?.trim() ?? "", recurrence_rule: recurrenceRule, starts_on: body.startsOn, ends_on: body.endsOn,
    status: "published", created_by: authData.user.id,
  }).select("id").single();
  if (seriesError || !series) return NextResponse.json({ error: "Aktivitetsserien kunde inte sparas" }, { status: 500 });

  const { data: activities, error: activitiesError } = await supabase.from("activities").insert(occurrences.map((item) => ({
    organization_id: team.organization_id, team_id: team.id, activity_type_id: activityType.id, series_id: series.id,
    title, description_markdown: body.description?.trim() ?? "", gathering_at: item.gatheringAt,
    starts_at: item.startsAt, ends_at: item.endsAt, location: body.location?.trim() ?? "", status: "published", created_by: authData.user.id,
  }))).select("id, organization_id, team_id, title, gathering_at, starts_at, ends_at, location, series_id, status");
  if (activitiesError || !activities) {
    await supabase.from("activity_series").delete().eq("id", series.id);
    return NextResponse.json({ error: "Seriens aktiviteter kunde inte sparas" }, { status: 500 });
  }

  const invitationRows = activities.flatMap((activity) => personIds.map((personId) => ({ organization_id: team.organization_id, activity_id: activity.id, person_id: personId })));
  const { error: invitationError } = invitationRows.length ? await supabase.from("invitations").insert(invitationRows) : { error: null };
  if (invitationError) {
    await supabase.from("activities").delete().eq("series_id", series.id);
    await supabase.from("activity_series").delete().eq("id", series.id);
    return NextResponse.json({ error: "Serien skapades inte eftersom kallelserna inte kunde sparas" }, { status: 500 });
  }

  return NextResponse.json({ seriesId: series.id, activities, invitedCount: personIds.length }, { status: 201 });
}
