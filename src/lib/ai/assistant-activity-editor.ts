import { z } from "zod";
import type { ActivityDraft } from "./activity-draft";

export const assistantActivityEditorSchema = z.object({
  teamId: z.uuid(),
  recurring: z.boolean(),
  activityTypeId: z.uuid().nullable().optional(),
  title: z.string(), description: z.string(), location: z.string(),
  startsOn: z.iso.date().nullable().optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/).nullable().optional(),
  endsOn: z.iso.date().nullable().optional(),
  weekdays: z.array(z.number().int().min(1).max(7)),
});
export type AssistantActivityEditor = z.infer<typeof assistantActivityEditorSchema>;

/** Missing details stay editable; the team's local clock supplies only the editor's date/time defaults. */
export function assistantActivityDraft(editor: AssistantActivityEditor, timeZone: string, now = new Date()): ActivityDraft {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map(part => [part.type, part.value]));
  return {
    activityTypeId: editor.activityTypeId,
    title: editor.title, description: editor.description, location: editor.location,
    startsOn: editor.startsOn ?? `${parts.year}-${parts.month}-${parts.day}`,
    startTime: editor.startTime?.slice(0, 5) ?? `${parts.hour}:${String(Math.floor(Number(parts.minute) / 5) * 5).padStart(2, "0")}`,
    durationMinutes: 90, gatheringMinutesBefore: 0, sources: [],
    recurrence: editor.recurring ? { weekdays: editor.weekdays, endsOn: editor.endsOn ?? null } : null,
  };
}
