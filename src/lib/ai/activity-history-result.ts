import { z } from "zod";

export const activityHistoryResultSchema = z.object({
  team: z.string(), from: z.iso.date(), through: z.iso.date(), timeZone: z.string(),
  category: z.enum(["session", "competition", "work"]),
  activityCount: z.number().int().nonnegative(),
  unreportedActivityCount: z.number().int().nonnegative().nullable(),
  truncated: z.boolean(),
  summary: z.object({ uniquePeople: z.number().int().nonnegative(), participationCount: z.number().int().nonnegative() }),
  activities: z.array(z.object({
    id: z.string(), title: z.string(), startsAt: z.string(),
    attendanceReported: z.boolean(), participationCount: z.number().int().nonnegative(),
  })),
});
export type ActivityHistoryResult = z.infer<typeof activityHistoryResultSchema>;
