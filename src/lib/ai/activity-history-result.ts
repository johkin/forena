import { z } from "zod";

export const activityHistoryResultSchema = z.object({
  kind: z.enum(["attendance", "invitations"]).optional(), sourceTeam: z.string().optional(), invitationResponse: z.enum(["all", "accepted", "pending", "declined"]).optional(),
  team: z.string(), from: z.iso.date(), through: z.iso.date(), timeZone: z.string(),
  category: z.enum(["session", "competition", "work"]),
  activityCount: z.number().int().nonnegative(),
  unreportedActivityCount: z.number().int().nonnegative().nullable(),
  truncated: z.boolean(),
  summary: z.object({ uniquePeople: z.number().int().nonnegative(), participationCount: z.number().int().nonnegative() }),
  memberRole: z.enum(["leader", "participant"]).optional(),
  records: z.array(z.object({ personId: z.string(), name: z.string(), activityId: z.string(), startsAt: z.iso.datetime({ offset: true }), attendance: z.enum(["present", "not_recorded", "unreported"]).nullable() })).optional(),
  activities: z.array(z.object({
    id: z.string(), title: z.string(), startsAt: z.string(),
    attendanceReported: z.boolean(), participationCount: z.number().int().nonnegative(),
  })),
});
export type ActivityHistoryResult = z.infer<typeof activityHistoryResultSchema>;
