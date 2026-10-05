import { tool } from "ai";
import { z } from "zod";
import { assessActivityReminder } from "../activity-reminders";
import type { AssistantDependencies } from "./team-assistant-types";
import type { ReminderDraft, ReminderMemory, ReminderAssessment } from "./reminder-draft";

export function createReminderTools(options: {
  supabase: AssistantDependencies["supabase"];
  teamId: string;
  activityIds: string[];
  timeZone?: string;
  memories: ReminderMemory[];
  onDraft: (draft: ReminderDraft) => void;
}) {
  const assessments = new Map<string, ReminderAssessment>();
  return {
    assessReminder: tool({
      description: "Läs aktuellt kallelseläge, aktivitetstyp, svarstid och senaste påminnelse för en aktivitet i CONTEXT. Krävs innan ett påminnelseförslag. Inga skrivningar.",
      inputSchema: z.object({ activityId: z.string() }).strict(),
      execute: async ({ activityId }) => {
        if (!options.activityIds.includes(activityId)) return { error: "Välj en aktivitet i den aktuella kontexten." };
        try {
          const assessment = await assessActivityReminder(options.supabase, options.teamId, activityId);
          assessments.set(activityId, assessment);
          return { assessment, memories: options.memories.map((memory, index) => ({ index, ...memory })) };
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Kallelseläget kunde inte läsas." };
        }
      },
    }),
    proposeReminder: tool({
      description: "Visa ett påminnelseförslag för separat granskning och knapptryck. Köar eller skickar aldrig. Ange endast index för relevanta delade minnen från assessReminder.",
      inputSchema: z.object({ activityId: z.string(), reason: z.string().trim().min(1).max(360), memoryIndexes: z.array(z.number().int().nonnegative()).max(5) }).strict(),
      execute: async ({ activityId, reason, memoryIndexes }) => {
        const assessment = assessments.get(activityId);
        if (!assessment) return { error: "Läs aktuellt kallelseläge med assessReminder först." };
        if (!assessment.canRemind) return { error: assessment.blockedReason };
        if (memoryIndexes.some(index => !options.memories[index])) return { error: "Minnesreferensen finns inte i underlaget." };
        const draft = { assessment, reason, timeZone: options.timeZone ?? "Europe/Stockholm", memories: [...new Set(memoryIndexes)].map(index => options.memories[index]) };
        options.onDraft(draft);
        return { proposed: true, requiresButtonConfirmation: true, pendingInvitations: assessment.pending };
      },
    }),
  };
}
