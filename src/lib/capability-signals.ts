import { z } from "zod";

export const teamSignalSchema = z.object({
  id: z.string(), activityId: z.string(), revision: z.number().int(),
  severity: z.enum(["info", "warning"]), title: z.string(), text: z.string(),
  capabilityId: z.string(), type: z.string(), evaluatedAt: z.string(), facts: z.record(z.string(), z.unknown()),
  actions: z.array(z.object({ id: z.enum(["remind-unanswered", "invite-more-players"]), label: z.string() })),
  lastAction: z.object({ id: z.string(), createdAt: z.string(), result: z.unknown() }).nullable(),
});
export type TeamSignal = z.infer<typeof teamSignalSchema>;
