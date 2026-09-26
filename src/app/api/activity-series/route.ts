import { NextResponse } from "next/server";
import { invitationScheduleForOccurrence, previewWeeklySeries, type ResponseDueRule, type SeriesPreviewInput } from "@/lib/activity-series";
import { createClient } from "@/lib/supabase/server";

type CreateSeriesBody = SeriesPreviewInput & {
  teamId?: string;
  activityTypeId?: string;
  title?: string;
  description?: string;
  location?: string;
  invitationAudience?: "players" | "leaders" | "group";
  invitationGroupId?: string;
  invitationSendMinutesBefore?: number;
  responseDueRule?: ResponseDueRule;
  reminderMinutesBeforeDue?: number;
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as CreateSeriesBody | null;
  const title = body?.title?.trim();
  if (!body?.teamId || !title || !body.startsOn || !body.endsOn || !body.startTime) {
    return NextResponse.json({ error: "Ogiltiga uppgifter för aktivitetsserien" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Du måste logga in" }, { status: 401 });
  const { data: team } = await supabase.from("teams").select("id, organization_id").eq("id", body.teamId).maybeSingle();
  if (!team) return NextResponse.json({ error: "Laget kunde inte hittas" }, { status: 404 });
  const { data: organization } = await supabase.from("organizations").select("time_zone").eq("id", team.organization_id).single();
  const timeZone = organization?.time_zone;
  if (!timeZone) return NextResponse.json({ error: "Föreningen kunde inte hittas" }, { status: 404 });
  const { data: allowed } = await supabase.rpc("can_manage_team", { target_team_id: team.id });
  if (!allowed) return NextResponse.json({ error: "Du saknar behörighet för laget" }, { status: 403 });

  let occurrences;
  try {
    occurrences = previewWeeklySeries({ ...body, timeZone: timeZone });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Serien kunde inte beräknas" }, { status: 400 });
  }

  const typeQuery = supabase.from("activity_types").select("id").eq("organization_id", team.organization_id).eq("active", true);
  const { data: activityType } = body.activityTypeId
    ? await typeQuery.eq("id", body.activityTypeId).maybeSingle()
    : await typeQuery.eq("slug", "ovrigt").maybeSingle();
  if (!activityType) return NextResponse.json({ error: "Aktivitetstypen kunde inte hittas" }, { status: 400 });

  const invitationAudience = body.invitationAudience;
  const invitationGroupId = body.invitationGroupId;
  if (invitationAudience === "group") {
    if (!invitationGroupId) return NextResponse.json({ error: "Välj en undergrupp" }, { status: 400 });
    const { data: group } = await supabase.from("team_groups").select("id").eq("id", invitationGroupId).eq("team_id", team.id).maybeSingle();
    if (!group) return NextResponse.json({ error: "Undergruppen kunde inte hittas" }, { status: 400 });
  } else if (invitationGroupId) {
    return NextResponse.json({ error: "Undergrupp kan bara användas som målgrupp" }, { status: 400 });
  }

  let schedules: ReturnType<typeof invitationScheduleForOccurrence>[] = [];
  if (invitationAudience) {
    try {
      schedules = occurrences.map((item) => invitationScheduleForOccurrence(item.startsAt, timeZone, {
        invitationSendMinutesBefore: body.invitationSendMinutesBefore ?? 10080,
        responseDueRule: body.responseDueRule ?? "6h",
        reminderMinutesBeforeDue: body.reminderMinutesBeforeDue ?? 1440,
      }));
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Kallelseschemat är ogiltigt" }, { status: 400 });
    }
  }

  const recurrenceRule = {
    frequency: "weekly",
    weekdays: body.weekdays,
    startTime: body.startTime,
    durationMinutes: body.durationMinutes,
    gatheringMinutesBefore: body.gatheringMinutesBefore,
    timeZone: timeZone,
    invitationSendMinutesBefore: body.invitationSendMinutesBefore ?? 10080,
    responseDueRule: body.responseDueRule ?? "6h",
    reminderMinutesBeforeDue: body.reminderMinutesBeforeDue ?? 1440,
  };
  const { data: series, error: seriesError } = await supabase.from("activity_series").insert({
    organization_id: team.organization_id, team_id: team.id, activity_type_id: activityType.id, title,
    location: body.location?.trim() ?? "", recurrence_rule: recurrenceRule, starts_on: body.startsOn, ends_on: body.endsOn,
    status: "published", created_by: authData.user.id,
  }).select("id").single();
  if (seriesError || !series) return NextResponse.json({ error: "Aktivitetsserien kunde inte sparas" }, { status: 500 });

  const { data: activities, error: activitiesError } = await supabase.from("activities").insert(occurrences.map((item, index) => ({
    organization_id: team.organization_id, team_id: team.id, activity_type_id: activityType.id, series_id: series.id,
    title, description_markdown: body.description?.trim() ?? "", gathering_at: item.gatheringAt,
    starts_at: item.startsAt, ends_at: item.endsAt, location: body.location?.trim() ?? "", status: "published",
    invitation_send_at: schedules[index]?.invitationSendAt ?? null,
    response_due_at: schedules[index]?.responseDueAt ?? null,
    reminder_send_at: schedules[index]?.reminderSendAt ?? null,
    invitation_audience_kind: invitationAudience ?? null,
    invitation_group_id: invitationAudience === "group" ? invitationGroupId ?? null : null,
    created_by: authData.user.id,
  }))).select("id, organization_id, team_id, title, gathering_at, starts_at, ends_at, location, series_id, status, invitation_send_at, response_due_at, reminder_send_at");
  if (activitiesError || !activities) {
    await supabase.from("activity_series").delete().eq("id", series.id);
    return NextResponse.json({ error: "Seriens aktiviteter kunde inte sparas" }, { status: 500 });
  }

  if (invitationAudience) {
    const events = activities.flatMap((activity, index) => {
      const schedule = schedules[index];
      if (!schedule) return [];
      return [
        {
          organization_id: team.organization_id,
          activity_id: activity.id,
          event_type: "invitation_scheduled" as const,
          recipient_count: null,
          metadata: { scheduledAt: schedule.invitationSendAt, audience: invitationAudience, groupId: invitationGroupId ?? null },
          created_by: authData.user.id,
        },
        ...(schedule.reminderSendAt ? [{
          organization_id: team.organization_id,
          activity_id: activity.id,
          event_type: "reminder_scheduled" as const,
          recipient_count: null,
          metadata: { scheduledAt: schedule.reminderSendAt },
          created_by: authData.user.id,
        }] : []),
      ];
    });
    if (events.length) await supabase.from("activity_events").insert(events);
  }

  return NextResponse.json({ error: "Serien skapades inte eftersom kallelserna inte kunde sparas" }, { status: 500 });
  }

  if (personIds.length) {
    const queueResults = await Promise.all(activities.map((activity) =>
      supabase.rpc("queue_activity_invitation", { target_activity_id: activity.id })
    ));
    queueResults.forEach((result, index) => {
      if (result.error) console.warn("series_invitation_queue_failed", { activityId: activities[index]?.id, code: result.error.code });
    });

    const events = activities.flatMap((activity, index) => {
      const schedule = schedules[index];
      if (!schedule) return [];
      return [
        {
          organization_id: team.organization_id,
          activity_id: activity.id,
          event_type: "invitation_scheduled" as const,
          recipient_count: personIds.length,
          metadata: { scheduledAt: schedule.invitationSendAt },
          created_by: authData.user.id,
        },
        ...(schedule.reminderSendAt ? [{
          organization_id: team.organization_id,
          activity_id: activity.id,
          event_type: "reminder_scheduled" as const,
          recipient_count: personIds.length,
          metadata: { scheduledAt: schedule.reminderSendAt },
          created_by: authData.user.id,
        }] : []),
      ];
    });
    if (events.length) await supabase.from("activity_events").insert(events);
  }

  return NextResponse.json({ seriesId: series.id, activities }, { status: 201 });
}
