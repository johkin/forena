import { z } from "zod";
import { calendarScopeSchema } from "../../src/lib/calendar-response";

const personalActivitySchema = z.object({
  id: z.string(), title: z.string(), starts_at: z.string(), ends_at: z.string(),
  gathering_at: z.string().nullable(), response_due_at: z.string().nullable(),
  location: z.string(), description: z.string(), status: z.string(), can_manage_activities: z.boolean(), can_manage_attendance: z.boolean(),
  organization: z.object({ id: z.string(), name: z.string(), time_zone: z.string(), role: z.string().nullable() }),
  team: z.object({ id: z.string(), name: z.string(), organization_id: z.string(), roles: z.array(z.string()) }),
  people: z.array(z.object({ id: z.string(), name: z.string(), attendance: z.string(), invitation: z.object({
    id: z.string(), person_id: z.string(), name: z.string(), response: z.enum(["pending", "accepted", "declined"]), response_comment: z.string().nullable(),
  }).nullable() })),
});
export const kotlinCalendarSchema = calendarScopeSchema.extend({ reference_time: z.string(), activities: z.array(personalActivitySchema) });
