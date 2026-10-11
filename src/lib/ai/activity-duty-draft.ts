import { z } from "zod";

export const activityDutyBatchSchema = z.object({
  activityIds: z.array(z.guid()).min(1).max(100).refine(ids => new Set(ids).size === ids.length),
  name: z.string().trim().min(1).max(80),
  places: z.number().int().min(1).max(50),
  instructions: z.string().max(2000),
}).strict();
export type ActivityDutyBatch = z.infer<typeof activityDutyBatchSchema>;

export const dutyTargetSchema = z.object({
  id: z.guid(), title: z.string(), startsAt: z.string(), endsAt: z.string(),
  category: z.string(), sourceKind: z.enum(["manual", "imported"]),
  seriesId: z.guid().nullable(), seriesTitle: z.string().nullable(), externalSource: z.string().nullable(),
  venue: z.enum(["home", "away", "neutral"]).nullable(),
});
export const activityDutyPreviewSchema = z.object({
  fingerprint: z.string().regex(/^[a-f0-9]{32}$/),
  activities: z.array(dutyTargetSchema.extend({ exists: z.boolean() })).min(1).max(100),
});
export type ActivityDutyDraft = {
  teamId: string; timeZone: string; command: ActivityDutyBatch;
  unknownMatchVenueCount?: number;
  preview: z.infer<typeof activityDutyPreviewSchema>;
};
