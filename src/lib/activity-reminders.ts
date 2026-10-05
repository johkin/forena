import { createHash } from "node:crypto";
import type { AssistantDependencies } from "./ai/team-assistant-types";
import type { ReminderAssessment } from "./ai/reminder-draft";

type Client = AssistantDependencies["supabase"];

/** Read-only assessment shared by the assistant and the confirmation command. */
export async function assessActivityReminder(supabase: Client, teamId: string, activityId: string, now = new Date()): Promise<ReminderAssessment> {
  const permission = await supabase.rpc("has_team_permission", { target_team_id: teamId, target_permission: "invitation.manage" });
  if (permission.error || permission.data !== true) throw new Error("Du saknar behörighet att hantera lagets kallelser.");
  const activity = await supabase.from("activities")
    .select("id, title, activity_type_id, starts_at, response_due_at, status")
    .eq("team_id", teamId).eq("id", activityId).maybeSingle();
  if (activity.error || !activity.data) throw new Error("Aktiviteten kunde inte läsas i det aktuella laget.");
  const [invitations, history, type, players] = await Promise.all([
    supabase.from("invitations").select("person_id, response").eq("activity_id", activityId),
    supabase.from("activity_events").select("created_at").eq("activity_id", activityId)
      .in("event_type", ["reminder_scheduled", "reminder_sent"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("activity_types").select("name").eq("id", activity.data.activity_type_id).maybeSingle(),
    supabase.from("memberships").select("person_id").eq("team_id", teamId).eq("role", "participant").is("ends_on", null),
  ]);
  if (invitations.error || history.error || type.error || players.error) throw new Error("Kallelseläget kunde inte läsas. Försök igen.");
  const responses = invitations.data ?? [];
  const playerIds = new Set((players.data ?? []).map(item => item.person_id));
  const pending = responses.filter(item => item.response === "pending").length;
  const lastReminderAt = history.data?.created_at ?? null;
  const blockedReason = activity.data.status !== "published"
    ? "Aktiviteten är inte publicerad."
    : new Date(activity.data.starts_at).getTime() <= now.getTime()
      ? "Aktiviteten har redan börjat."
      : pending === 0 ? "Det finns inga obesvarade kallelser."
        : lastReminderAt && now.getTime() - new Date(lastReminderAt).getTime() < 60 * 60_000
          ? "En påminnelse har redan köats eller skickats den senaste timmen." : null;
  const snapshot = {
    teamId, activityId, title: activity.data.title, activityType: type.data?.name ?? "Aktivitet",
    startsAt: activity.data.starts_at, responseDueAt: activity.data.response_due_at,
    accepted: responses.filter(item => item.response === "accepted").length,
    declined: responses.filter(item => item.response === "declined").length,
    pending, lastReminderAt, canRemind: blockedReason === null, blockedReason,
    acceptedPlayers: responses.filter(item => playerIds.has(item.person_id) && item.response === "accepted").length,
    pendingPlayers: responses.filter(item => playerIds.has(item.person_id) && item.response === "pending").length,
  };
  const recipientState = responses.map(item => `${item.person_id}:${item.response}`).sort();
  return { ...snapshot, fingerprint: createHash("sha256").update(JSON.stringify({ snapshot, recipientState })).digest("hex") };
}

/** Only called from a separately authenticated user confirmation, never from AI tools. */
export async function queueConfirmedActivityReminder(supabase: Client, teamId: string, activityId: string, fingerprint: string) {
  const assessment = await assessActivityReminder(supabase, teamId, activityId);
  if (!assessment.canRemind) throw new Error(assessment.blockedReason ?? "Påminnelsen kan inte skickas.");
  if (assessment.fingerprint !== fingerprint) throw new Error("Kallelseläget har ändrats. Be assistenten om ett nytt förslag innan du skickar.");
  return queueActivityReminder(supabase, activityId);
}

/** Shared write command; the RPC enforces invitation.manage and resolves current recipients. */
export async function queueActivityReminder(supabase: Client, activityId: string) {
  const { data, error } = await supabase.rpc("queue_activity_reminder", { target_activity_id: activityId });
  if (error || typeof data !== "number") throw new Error("Påminnelsen kunde inte köas.");
  return { queuedRecipients: data };
}
