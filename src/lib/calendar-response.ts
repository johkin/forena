import { z } from "zod";

export const calendarScopeSchema = z.object({
  people: z.array(z.object({ id: z.string(), displayName: z.string(), isSelf: z.boolean(), teamIds: z.array(z.string()) })),
  teams: z.array(z.object({ id: z.string(), name: z.string() })),
});
const activity = z.object({ id: z.string(), organizationId: z.string(), teamId: z.string(), activityTypeId: z.string().optional(),
  title: z.string(), description: z.string().optional(), location: z.string(), startsAt: z.string(), endsAt: z.string(),
  gatheringAt: z.string().optional(), responseDueAt: z.string().optional(), invitationSendAt: z.string().optional(), status: z.enum(["published", "cancelled", "draft"]).optional(),
});
export const calendarResponseSchema = calendarScopeSchema.extend({
  accountId: z.string(), activities: z.array(activity),
  items: z.array(z.object({
    activity,
    member: z.object({ id: z.string(), organizationId: z.string(), displayName: z.string() }),
    team: z.object({ id: z.string(), organizationId: z.string(), sectionId: z.string(), slug: z.string(), name: z.string(), season: z.string() }),
    organization: z.object({ id: z.string(), slug: z.string(), name: z.string(), assistantName: z.string(), timeZone: z.string().optional() }),
    invitation: z.object({ id: z.string(), organizationId: z.string(), activityId: z.string(), memberId: z.string(), response: z.enum(["pending", "accepted", "declined"]) }).optional(),
    attendance: z.enum(["present", "absent", "unknown"]).optional(), hasDutyAssignment: z.boolean().optional(),
  })),
});
