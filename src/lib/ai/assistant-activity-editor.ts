import { z } from "zod";
import type { ActivityEditorDraft } from "./activity-draft";

export const assistantActivityEditorSchema = z.object({
  teamId: z.uuid(),
  recurring: z.boolean(),
  activityTypeId: z.uuid().nullable().optional(),
  title: z.string(), description: z.string(), location: z.string(),
  startsOn: z.iso.date().nullable().optional(),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/).nullable().optional(),
  endsOn: z.iso.date().nullable().optional(),
  endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/).nullable().optional(),
  durationMinutes: z.number().int().min(1).max(10080).nullable().optional(),
  gatheringMinutesBefore: z.number().int().min(0).max(10080).nullable().optional(),
  weekdays: z.array(z.number().int().min(1).max(7)),
});
export type AssistantActivityEditor = z.infer<typeof assistantActivityEditorSchema>;

/** Missing details stay editable; the team's local clock supplies only the editor's date/time defaults. */
export function assistantActivityDraft(editor: AssistantActivityEditor, timeZone: string, now = new Date()): ActivityEditorDraft {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map(part => [part.type, part.value]));
  const startTime = editor.startTime?.slice(0, 5) ?? `${parts.hour}:${String(Math.floor(Number(parts.minute) / 5) * 5).padStart(2, "0")}`;
  const endTime = editor.endTime?.slice(0, 5);
  let durationMinutes = editor.durationMinutes ?? undefined;
  if (editor.recurring && endTime && editor.startTime) {
    const minutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
    const difference = minutes(endTime) - minutes(startTime);
    durationMinutes = difference > 0 ? difference : difference + 24 * 60;
  }
  return {
    activityTypeId: editor.activityTypeId,
    title: editor.title, description: editor.description, location: editor.location,
    startsOn: editor.startsOn ?? `${parts.year}-${parts.month}-${parts.day}`,
    startTime,
    ...(durationMinutes != null ? { durationMinutes } : {}),
    ...(editor.gatheringMinutesBefore != null ? { gatheringMinutesBefore: editor.gatheringMinutesBefore } : {}),
    ...(!editor.recurring && endTime ? { endTime, endsOn: editor.endsOn ?? editor.startsOn ?? `${parts.year}-${parts.month}-${parts.day}` } : {}),
    sources: [],
    recurrence: editor.recurring ? { weekdays: editor.weekdays, endsOn: editor.endsOn ?? null } : null,
  };
}
