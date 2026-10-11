import { tool } from "ai";
import { z } from "zod";
import { previewActivityDutyBatch } from "../activity-duty-batch";
import { activityDutyBatchSchema, dutyTargetSchema, type ActivityDutyDraft } from "./activity-duty-draft";
import type { AssistantDependencies } from "./team-assistant-types";

/** Read/propose only. The model is never given a write tool. */
export function createActivityDutyTools(options: {
  supabase: AssistantDependencies["supabase"]; teamId: string; timeZone: string;
  onDraft: (draft: ActivityDutyDraft) => void;
}) {
  const available = new Set<string>();
  let unknownMatchVenueCount = 0;
  return {
    listDutyActivities: tool({
      description: "Läs lagets kommande aktiviteter med kategori, importkälla, serie och verifierad hemma/borta. Högst 200: begränsa period vid större urval. Inga personuppgifter eller skrivningar. Hemmamatch kräver competition och venue=home; null betyder okänd, gissa aldrig från namn/plats.",
      inputSchema: z.object({ from: z.iso.datetime({ offset: true }).nullable(), through: z.iso.datetime({ offset: true }).nullable() }).strict(),
      execute: async ({ from, through }) => {
        available.clear();
        unknownMatchVenueCount = 0;
        const { data, error } = await options.supabase.rpc("list_activity_duty_targets", { target_team_id: options.teamId, from_time: from, through_time: through });
        if (error) return { error: error.code === "42501" ? "Du saknar behörighet till lagets uppgifter." : "Aktiviteterna kunde inte läsas. Begränsa perioden till högst 200 aktiviteter." };
        const parsed = z.array(dutyTargetSchema).max(200).safeParse(data);
        if (!parsed.success) return { error: "Aktivitetsunderlaget kunde inte verifieras." };
        parsed.data.forEach(activity => available.add(activity.id));
        unknownMatchVenueCount = parsed.data.filter(a => a.category === "competition" && a.venue === null).length;
        return { activities: parsed.data, unknownMatchVenueCount };
      },
    }),
    proposeActivityDuties: tool({
      description: "Förhandsgranska en uppgift med tomma platser på ett exakt urval från listDutyActivities (högst 100). Uppgiften gäller hela aktivitetens tid och följer tidsändringar. Samma uppgiftsnamn som redan finns hoppas över. Skapar inget: separat Spara uppgifter-knapp krävs. Fråga om antal platser om det saknas, och om serie/importkälla är tvetydig.",
      inputSchema: activityDutyBatchSchema,
      execute: async command => {
        if (command.activityIds.some(id => !available.has(id))) return { error: "Läs aktiviteterna först och välj endast ID:n ur resultatet." };
        try {
          const preview = await previewActivityDutyBatch(options.supabase, options.teamId, command);
          options.onDraft({ teamId: options.teamId, timeZone: options.timeZone, command, preview, unknownMatchVenueCount });
          return { proposed: true, requiresButtonConfirmation: true, createCount: preview.activities.filter(a => !a.exists).length, skippedCount: preview.activities.filter(a => a.exists).length };
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Förslaget kunde inte verifieras." };
        }
      },
    }),
  };
}
