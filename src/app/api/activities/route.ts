import { NextResponse } from "next/server";
import { invitationScheduleForOccurrence, type ResponseDueRule } from "@/lib/activity-series";
import { createClient } from "@/lib/supabase/server";

type CreateActivityBody = {
  teamId?: string;
  activityTypeId?: string;
  title?: string;
  description?: string;
  gatheringAt?: string;
  startsAt?: string;
  endsAt?: string;
  location?: string;
  personIds?: string[];
  invitationSendMinutesBefore?: number;
  responseDueRule?: ResponseDueRule;
  reminderMinutesBeforeDue?: number;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CreateActivityBody | null;
  const title = body?.title?.trim();
  const location = body?.location?.trim() ?? "";
  const description = body?.description?.trim() ?? "";
  const gatheringAt = body?.gatheringAt ? new Date(body.gatheringAt) : null;
  const startsAt = body?.startsAt ? new Date(body.startsAt) : null;
  const endsAt = body?.endsAt ? new Date(body.endsAt) : null;
  const personIds = [...new Set(body?.personIds ?? [])];

  if (!body?.teamId || !title || !startsAt || !endsAt || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || (gatheringAt && Number.isNaN(gatheringAt.getTime()))) {
    return NextResponse.json({ error: "Ogiltiga aktivitetsuppgifter" }, { status: 400 });
  }
  if (endsAt <= startsAt) return NextResponse.json({ error: "Sluttiden måste vara efter starttiden" }, { status: 400 });
  if (gatheringAt && gatheringAt > startsAt) return NextResponse.json({ error: "Samlingstiden måste vara före eller samma som starttiden" }, { status: 400 });

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Du måste logga in" }, { status: 401 });

  const { data: team } = await supabase.from("teams").select("id, organization_id").eq("id", body.teamId).maybeSingle();
  if (!team) return NextResponse.json({ error: "Laget kunde inte hittas" }, { status: 404 });
  const { data: organization } = await supabase.from("organizations").select("time_zone").eq("id", team.organization_id).single();
  const timeZone = organization?.time_zone;
  if (!timeZone) return NextResponse.json({ error: "Föreningen kunde inte hittas" }, { status: 404 });

  const typeQuery = supabase.from("activity_types").select("id").eq("organization_id", team.organization_id).eq("active", true);
  const { data: activityType } = body.activityTypeId
    ? await typeQuery.eq("id", body.activityTypeId).maybeSingle()
    : await typeQuery.eq("slug", "ovrigt").maybeSingle();
  if (!activityType) return NextResponse.json({ error: "Aktivitetstypen kunde inte hittas" }, { status: 400 });

  const { data: allowed } = await supabase.rpc("can_manage_team", { target_team_id: team.id });
  if (!allowed) return NextResponse.json({ error: "Du saknar behörighet för laget" }, { status: 403 });

  let invitedPersonIds: string[] = [];
  if (personIds.length) {
    const { data: memberships } = await supabase.from("memberships").select("person_id").eq("team_id", team.id).in("role", ["participant", "leader"]).is("ends_on", null).in("person_id", personIds);
    invitedPersonIds = (memberships ?? []).map((membership) => membership.person_id);
    if (invitedPersonIds.length !== personIds.length) return NextResponse.json({ error: "En eller flera valda personer tillhör inte laget" }, { status: 400 });
  }

  let schedule: { invitationSendAt: string; responseDueAt: string; reminderSendAt: string | null } | undefined;
  if (invitedPersonIds.length) {
    try {
      schedule = invitationScheduleForOccurrence(startsAt.toISOString(), timeZone, {
        invitationSendMinutesBefore: body.invitationSendMinutesBefore ?? 10080,
        responseDueRule: body.responseDueRule ?? "6h",
        reminderMinutesBeforeDue: body.reminderMinutesBeforeDue ?? 1440,
      });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Kallelseschemat är ogiltigt" }, { status: 400 });
    }
  }

  const { data: activity, error: activityError } = await supabase.from("activities").insert({
    organization_id: team.organization_id,
    team_id: team.id,
    activity_type_id: activityType.id,
    title,
    description_markdown: description,
    gathering_at: gatheringAt?.toISOString() ?? null,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    location,
    invitation_send_at: schedule?.invitationSendAt ?? null,
    response_due_at: schedule?.responseDueAt ?? null,
    reminder_send_at: schedule?.reminderSendAt ?? null,
    created_by: authData.user.id,
  }).select("id, organization_id, team_id, title, gathering_at, starts_at, ends_at, location, series_id, status, invitation_send_at, response_due_at, reminder_send_at").single();

  if (activityError || !activity) return NextResponse.json({ error: "Aktiviteten kunde inte sparas" }, { status: 500 });

  const invitationRows = invitedPersonIds.map((personId) => ({ organization_id: team.organization_id, activity_id: activity.id, person_id: personId }));
  const { data: invitations, error: invitationError } = invitationRows.length
    ? await supabase.from("invitations").insert(invitationRows).select("id, organization_id, activity_id, person_id, response, responded_at")
    : { data: [], error: null };

  if (invitationError) {
    await supabase.from("activities").delete().eq("id", activity.id);
    return NextResponse.json({ error: "Kallelserna kunde inte sparas" }, { status: 500 });
  }

  if (invitedPersonIds.length) {
    const { error: queueError } = await supabase.rpc("queue_activity_invitation", { target_activity_id: activity.id });
    if (queueError) console.warn("activity_invitation_queue_failed", { activityId: activity.id, code: queueError.code });
  }

  if (schedule && invitedPersonIds.length) {
    const events = [
      {
        organization_id: team.organization_id,
        activity_id: activity.id,
        event_type: "invitation_scheduled" as const,
        recipient_count: invitedPersonIds.length,
        metadata: { scheduledAt: schedule.invitationSendAt },
        created_by: authData.user.id,
      },
      ...(schedule.reminderSendAt ? [{
        organization_id: team.organization_id,
        activity_id: activity.id,
        event_type: "reminder_scheduled" as const,
        recipient_count: invitedPersonIds.length,
        metadata: { scheduledAt: schedule.reminderSendAt },
        created_by: authData.user.id,
      }] : []),
    ];
    await supabase.from("activity_events").insert(events);
  }

  return NextResponse.json({ activity, invitations }, { status: 201 });
}
