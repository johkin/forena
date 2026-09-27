import { NextResponse } from "next/server";
import { invitationScheduleForOccurrence, type ResponseDueRule } from "@/lib/activity-series";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ activityId: string }> };
type Body =
  | { mode: "now"; personIds?: string[] }
  | { mode: "schedule"; audience?: "players" | "leaders" | "group"; groupId?: string; invitationSendMinutesBefore?: number; responseDueRule?: ResponseDueRule; reminderMinutesBeforeDue?: number; reminderMinutesBeforeDueList?: number[] };

export async function POST(request: Request, { params }: Props) {
  const { activityId } = await params;
  const body = await request.json().catch(() => null) as Body | null;
  if (!body || !["now", "schedule"].includes(body.mode)) return NextResponse.json({ error: "Ogiltig kallelse" }, { status: 400 });

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Du måste logga in" }, { status: 401 });

  const { data: activity } = await supabase.from("activities").select("id, organization_id, team_id, starts_at").eq("id", activityId).maybeSingle();
  if (!activity?.team_id) return NextResponse.json({ error: "Aktiviteten kunde inte hittas" }, { status: 404 });
  const { data: allowed } = await supabase.rpc("can_manage_team", { target_team_id: activity.team_id });
  if (!allowed) return NextResponse.json({ error: "Du saknar behörighet för laget" }, { status: 403 });

  if (body.mode === "now") {
    const personIds = [...new Set((body.personIds ?? []).filter(Boolean))];
    if (!personIds.length) return NextResponse.json({ error: "Välj minst en person" }, { status: 400 });
    const { data: memberships } = await supabase.from("memberships").select("person_id").eq("team_id", activity.team_id).in("person_id", personIds).in("role", ["participant", "leader"]).is("ends_on", null);
    const valid = new Set((memberships ?? []).map((item) => item.person_id));
    if (personIds.some((id) => !valid.has(id))) return NextResponse.json({ error: "Någon av de valda personerna tillhör inte laget" }, { status: 400 });

    const { error: invitationError } = await supabase.from("invitations").upsert(personIds.map((personId) => ({
      organization_id: activity.organization_id, activity_id: activity.id, person_id: personId,
    })), { onConflict: "activity_id,person_id", ignoreDuplicates: true });
    if (invitationError) return NextResponse.json({ error: "Kallelsen kunde inte skapas" }, { status: 500 });

    const { data: queued, error: queueError } = await supabase.rpc("queue_activity_invitation", { target_activity_id: activity.id });
    if (queueError) return NextResponse.json({ error: "Kallelsen skapades men kunde inte köas" }, { status: 500 });
    await supabase.from("activity_reminder_schedules").delete().eq("activity_id", activity.id).is("materialized_at", null);
  if (reminderSchedules.length) {
    const { error: reminderError } = await supabase.from("activity_reminder_schedules").insert(reminderSchedules.map((item) => ({
      organization_id: activity.organization_id, activity_id: activity.id, send_at: item.sendAt, created_by: authData.user.id,
    })));
    if (reminderError) return NextResponse.json({ error: "Kallelsen sparades, men påminnelserna kunde inte schemaläggas" }, { status: 500 });
  }

  await supabase.from("activity_events").insert({
      organization_id: activity.organization_id, activity_id: activity.id, event_type: "invitation_sent",
      recipient_count: personIds.length, metadata: { mode: "now", personIds }, created_by: authData.user.id,
    });
    return NextResponse.json({ invited: personIds.length, queuedRecipients: queued ?? 0 });
  }

  const audience = body.audience;
  if (!audience) return NextResponse.json({ error: "Välj målgrupp" }, { status: 400 });
  if (audience === "group") {
    if (!body.groupId) return NextResponse.json({ error: "Välj en undergrupp" }, { status: 400 });
    const { data: group } = await supabase.from("team_groups").select("id").eq("id", body.groupId).eq("team_id", activity.team_id).maybeSingle();
    if (!group) return NextResponse.json({ error: "Undergruppen kunde inte hittas" }, { status: 400 });
  }
  const { data: organization } = await supabase.from("organizations").select("time_zone").eq("id", activity.organization_id).single();
  if (!organization?.time_zone) return NextResponse.json({ error: "Föreningens tidszon saknas" }, { status: 500 });

  let schedule;
  try {
    schedule = invitationScheduleForOccurrence(activity.starts_at, organization.time_zone, {
      invitationSendMinutesBefore: body.invitationSendMinutesBefore ?? 10080,
      responseDueRule: body.responseDueRule ?? "6h",
      reminderMinutesBeforeDue: body.reminderMinutesBeforeDue ?? 1440,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kallelseschemat är ogiltigt" }, { status: 400 });
  }
  if (new Date(schedule.invitationSendAt).getTime() <= Date.now()) return NextResponse.json({ error: "Den schemalagda tiden har redan passerat. Använd Skicka nu i stället." }, { status: 400 });

  const reminderOffsets = [...new Set((body.reminderMinutesBeforeDueList ?? (body.reminderMinutesBeforeDue ? [body.reminderMinutesBeforeDue] : [])).filter((value) => Number.isFinite(value) && value > 0))];
  const reminderSchedules = reminderOffsets.map((minutes) => ({ minutes, sendAt: new Date(new Date(schedule.responseDueAt).getTime() - minutes * 60_000).toISOString() }));
  if (reminderSchedules.some((item) => new Date(item.sendAt).getTime() < new Date(schedule.invitationSendAt).getTime())) return NextResponse.json({ error: "En påminnelse hamnar före kallelsen" }, { status: 400 });

  const { error } = await supabase.from("activities").update({
    invitation_audience_kind: audience,
    invitation_group_id: audience === "group" ? body.groupId : null,
    invitation_send_at: schedule.invitationSendAt,
    response_due_at: schedule.responseDueAt,
    reminder_send_at: null,
    invitation_materialized_at: null,
  }).eq("id", activity.id);
  if (error) return NextResponse.json({ error: "Kallelsen kunde inte schemaläggas" }, { status: 500 });

  await supabase.from("activity_events").insert({
    organization_id: activity.organization_id, activity_id: activity.id, event_type: "invitation_scheduled",
    recipient_count: null, metadata: { scheduledAt: schedule.invitationSendAt, audience, groupId: body.groupId ?? null }, created_by: authData.user.id,
  });
  return NextResponse.json({ schedule });
}
