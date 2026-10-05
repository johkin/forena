import { buildInvitationSchedule, requireFutureSchedule } from "@/lib/activity-schedule";
import { NextResponse } from "next/server";
import { type ResponseDueRule } from "@/lib/activity-series";
import { createClient } from "@/lib/supabase/server";
import { validateAudienceSelection, type AudienceSelection } from "@/lib/invitation-audience";

type Props = { params: Promise<{ activityId: string }> };
type Body =
  | { mode: "now"; personIds?: string[] }
  | { mode: "schedule"; audience?: "players" | "leaders" | "group" | "selection"; groupId?: string; selection?: AudienceSelection; invitationSendMinutesBefore?: number; responseDueRule?: ResponseDueRule; reminderMinutesBeforeDue?: number; reminderMinutesBeforeDueList?: number[]; timingRules?: unknown };

export async function POST(request: Request, { params }: Props) {
  const { activityId } = await params;
  const body = await request.json().catch(() => null) as Body | null;
  if (!body || !["now", "schedule"].includes(body.mode)) return NextResponse.json({ error: "Ogiltig kallelse" }, { status: 400 });

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Du måste logga in" }, { status: 401 });

  const { data: activity } = await supabase.from("activities").select("id, organization_id, team_id, starts_at").eq("id", activityId).maybeSingle();
  if (!activity?.team_id) return NextResponse.json({ error: "Aktiviteten kunde inte hittas" }, { status: 404 });
  const { data: allowed } = await supabase.rpc("has_team_permission", { target_team_id: activity.team_id, target_permission: "invitation.manage" });
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
    if (invitationError) {
      console.error("activity_invitation.insert_failed", { activityId, code: invitationError.code, message: invitationError.message });
      return NextResponse.json({ error: "Kallelsen kunde inte skapas" }, { status: 500 });
    }

    const { data: queued, error: queueError } = await supabase.rpc("queue_activity_invitation", { target_activity_id: activity.id, target_person_ids: personIds });
    if (queueError) {
      console.error("activity_invitation.queue_failed", { activityId, code: queueError.code, message: queueError.message });
      return NextResponse.json({ error: "Kallelsen skapades men kunde inte köas" }, { status: 500 });
    }
    console.info("activity_invitation.queued", { activityId, selectedPeople: personIds.length, queuedRecipients: queued ?? 0 });
    await supabase.from("activity_reminder_schedules").delete().eq("activity_id", activity.id).is("materialized_at", null);
    await supabase.from("activity_events").insert({
      organization_id: activity.organization_id, activity_id: activity.id, event_type: "invitation_queued",
      recipient_count: queued ?? 0, metadata: { mode: "now", selectedPeople: personIds.length }, created_by: authData.user.id,
    });
    return NextResponse.json({ invited: personIds.length, queuedRecipients: queued ?? 0 });
  }

  const audience = body.audience;
  if (!audience) return NextResponse.json({ error: "Välj målgrupp" }, { status: 400 });
  let selection: AudienceSelection | undefined;
  if (audience === "selection") {
    try { selection = await validateAudienceSelection(supabase, activity.team_id, body.selection); }
    catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  }
  if (audience === "group") {
    if (!body.groupId) return NextResponse.json({ error: "Välj en undergrupp" }, { status: 400 });
    const { data: group } = await supabase.from("team_groups").select("id").eq("id", body.groupId).eq("team_id", activity.team_id).maybeSingle();
    if (!group) return NextResponse.json({ error: "Undergruppen kunde inte hittas" }, { status: 400 });
  }
  const { data: organization } = await supabase.from("organizations").select("time_zone").eq("id", activity.organization_id).single();
  if (!organization?.time_zone) return NextResponse.json({ error: "Föreningens tidszon saknas" }, { status: 500 });

  let schedule;
  try {
    schedule = buildInvitationSchedule(activity.starts_at, organization.time_zone, body);
    requireFutureSchedule(schedule);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kallelseschemat är ogiltigt" }, { status: 400 });
  }
  if (new Date(schedule.invitationSendAt).getTime() <= Date.now()) return NextResponse.json({ error: "Den schemalagda tiden har redan passerat. Använd Skicka nu i stället." }, { status: 400 });

  const { error } = await supabase.from("activities").update({
    invitation_audience_kind: audience,
    invitation_group_id: audience === "group" ? body.groupId : null,
    ...(selection ? { invitation_audience_roles: selection.roles, invitation_audience_group_ids: selection.groupIds, invitation_audience_responsibility_type_ids: selection.responsibilityTypeIds } : {}),
    invitation_send_at: schedule.invitationSendAt,
    response_due_at: schedule.responseDueAt,
    reminder_send_at: null,
    reminder_send_ats: schedule.reminderSendAts,
    invitation_materialized_at: null,
  }).eq("id", activity.id);
  if (error) {
    console.error("activity_invitation.schedule_failed", { activityId, code: error.code, message: error.message });
    return NextResponse.json({ error: "Kallelsen kunde inte schemaläggas" }, { status: 500 });
  }
  console.info("activity_invitation.scheduled", { activityId, sendAt: schedule.invitationSendAt, audience });

  await supabase.from("activity_events").insert({
    organization_id: activity.organization_id, activity_id: activity.id, event_type: "invitation_scheduled",
    recipient_count: null, metadata: { scheduledAt: schedule.invitationSendAt, audience, groupId: body.groupId ?? null }, created_by: authData.user.id,
  });
  return NextResponse.json({ schedule });
}
