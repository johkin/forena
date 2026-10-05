import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const activityRoles = ["participant", "leader", "guardian", "volunteer"] as const;
export type ActivityRole = typeof activityRoles[number];
export const activityRoleLabels: Record<ActivityRole, string> = { participant: "Spelare", leader: "Ledare", guardian: "Målsman", volunteer: "Funktionär" };
export const participantsSchema = z.object({
  participants: z.array(z.object({ personId: z.uuid(), role: z.enum(activityRoles) })).min(1).max(200),
  registerAccepted: z.boolean().default(false),
}).refine(value => new Set(value.participants.map(p => p.personId)).size === value.participants.length, "Samma person får bara väljas en gång");
export const dutyAssignmentSchema = z.object({ personId: z.uuid(), dutyTypeId: z.uuid().nullable(), completed: z.boolean() })
  .refine(value => !value.completed || value.dutyTypeId !== null, "Välj uppgift innan den markeras genomförd");

/** Shared application command: SQL rechecks authorization and commits delivery atomically. */
export async function addActivityParticipants(supabase: SupabaseClient<Database>, activityId: string, input: unknown) {
  const selection = participantsSchema.parse(input);
  return supabase.rpc("add_activity_participants", {
    target_activity_id: activityId,
    participants: selection.participants,
    register_accepted: selection.registerAccepted,
  });
}
