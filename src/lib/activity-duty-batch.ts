import type { AssistantDependencies } from "./ai/team-assistant-types";
import { activityDutyBatchSchema, activityDutyPreviewSchema, type ActivityDutyBatch } from "./ai/activity-duty-draft";

type Client = AssistantDependencies["supabase"];
export async function previewActivityDutyBatch(supabase: Client, teamId: string, value: ActivityDutyBatch) {
  const command = activityDutyBatchSchema.parse(value);
  const { data, error } = await supabase.rpc("preview_activity_duty_batch", { target_team_id: teamId, command });
  if (error) throw new Error(error.code === "42501" ? "Du saknar behörighet att hantera uppgifter i laget." : "Urvalet kunde inte verifieras. Välj kommande aktiviteter i samma lag och försök igen.");
  return activityDutyPreviewSchema.parse(data);
}
