import { z } from "zod";
import { localActivityTime } from "@/lib/activity-time-rules";
// PostgreSQL UUID columns also contain seeded/imported GUIDs without RFC version/variant bits.
// Shape validation is separate from the RPC's authorization and revision checks.
const storedId = z.guid();
const instant = z.iso.datetime({ offset: true });
export const dutyDefinitionSchema = z.object({
 timingKind: z.enum(["interval", "deadline", "none"]), startsAt: instant.nullable().default(null), endsAt: instant.nullable().default(null), dueAt: instant.nullable().default(null), instructions: z.string().max(2000).default(""), places: z.number().int().min(1).max(50),
}).superRefine((d, ctx) => {
 const valid = d.timingKind === "interval" ? d.startsAt && d.endsAt && new Date(d.endsAt) > new Date(d.startsAt) && !d.dueAt : d.timingKind === "deadline" ? d.dueAt && !d.startsAt && !d.endsAt : !d.startsAt && !d.endsAt && !d.dueAt;
 if (!valid) ctx.addIssue({ code: "custom", message: "Ange tidsintervall, deadline eller ingen tid" });
});
export const dutySeriesDefinitionSchema = dutyDefinitionSchema.safeExtend({
 intervalMinutes: z.number().int().min(5).multipleOf(5).nullable().default(null),
 openingInstructions: z.string().max(500).default(""), closingInstructions: z.string().max(500).default(""),
}).superRefine((d, ctx) => {
 if (d.timingKind !== "interval" && (d.intervalMinutes !== null || d.openingInstructions || d.closingInstructions)) ctx.addIssue({ code: "custom", message: "Passlängd och öppning/stängning gäller bara tidsintervall" });
 if (d.timingKind === "interval" && d.startsAt && d.endsAt && d.intervalMinutes && Math.ceil((Date.parse(d.endsAt) - Date.parse(d.startsAt)) / (d.intervalMinutes * 60000)) > 48) ctx.addIssue({ code: "custom", message: "Välj högst 48 pass" });
});
export type DutySeriesDefinition = z.infer<typeof dutySeriesDefinitionSchema>;
export type DutySeries = { id: string; revision: number; name: string; dutyTypeId: string; definition: DutySeriesDefinition };

/** Materialize a series template; SQL uses the same UTC interval splitting. */
export function expandDutySeries(input: DutySeriesDefinition) {
 const definition = dutySeriesDefinitionSchema.parse(input);
 if (definition.timingKind !== "interval") return [dutyDefinitionSchema.parse(definition)];
 const start = Date.parse(definition.startsAt!), end = Date.parse(definition.endsAt!);
 const step = definition.intervalMinutes ? definition.intervalMinutes * 60000 : end - start;
 const duties: z.infer<typeof dutyDefinitionSchema>[] = [];
 for (let at = start; at < end; at += step) {
   const stop = Math.min(end, at + step);
   duties.push(dutyDefinitionSchema.parse({ ...definition, startsAt: new Date(at).toISOString(), endsAt: new Date(stop).toISOString(),
     instructions: [definition.instructions, at === start ? definition.openingInstructions : "", stop === end ? definition.closingInstructions : ""].filter(Boolean).join("\n") }));
 }
 return duties;
}

export const dutyCommandSchema = z.discriminatedUnion("op", [
 z.object({ op: z.literal("create_series"), dutyTypeId: storedId, definition: dutySeriesDefinitionSchema }),
 z.object({ op: z.literal("edit_series"), seriesId: storedId, revision: z.number().int().positive(), definition: dutySeriesDefinitionSchema }),
 z.object({ op: z.literal("cancel_series"), seriesId: storedId, revision: z.number().int().positive() }),
 z.object({ op: z.literal("edit_duty"), dutyId: storedId, revision: z.number().int().positive(), definition: dutyDefinitionSchema }),
 z.object({ op: z.literal("cancel_duties"), duties: z.array(z.object({ dutyId: storedId, revision: z.number().int().positive() })).min(1).max(100).refine(items => new Set(items.map(item => item.dutyId)).size === items.length, "Välj varje uppgift högst en gång") }),
 z.object({ op: z.literal("cancel_duty"), dutyId: storedId, revision: z.number().int().positive() }),
 z.object({ op: z.literal("edit_type"), dutyTypeId: storedId, revision: z.number().int().positive(), name: z.string().trim().min(1).max(80), active: z.boolean() }),
 z.object({ op: z.literal("assign_batch"), assignments: z.array(z.object({ slotId: storedId, personId: storedId, revision: z.number().int().positive() })).min(1).max(100) }),
 z.object({ op: z.literal("create"), dutyTypeId: storedId, duties: z.array(dutyDefinitionSchema).min(1).max(48) }),
 z.object({ op: z.literal("settings"), claimRequiresApproval: z.boolean(), changeRequiresApproval: z.boolean(), selfServiceUntil: instant.nullable() }),
 z.object({ op: z.literal("claim"), personId: storedId, targetSlotId: storedId }),
 z.object({ op: z.literal("propose"), personId: storedId, sourceSlotId: storedId, targetSlotId: storedId.nullable() }),
 z.object({ op: z.enum(["approve", "reject", "withdraw"]), requestId: storedId }),
 z.object({ op: z.literal("assign"), slotId: storedId, personId: storedId.nullable(), revision: z.number().int().positive() }),
 z.object({ op: z.literal("complete"), slotId: storedId, completed: z.boolean(), revision: z.number().int().positive() }),
]);
export type DutyCommand = z.infer<typeof dutyCommandSchema>;
export type DutySlot = { id: string; personId: string | null; personName: string | null; occupied: boolean; mine: boolean; completedAt: string | null; revision: number };
export type Duty = { seriesId?: string; position?: number; id: string; dutyTypeId: string; revision: number; name: string; timingKind: "interval" | "deadline" | "none"; startsAt: string | null; endsAt: string | null; dueAt: string | null; instructions: string; slots: DutySlot[] };
export type DutyRequest = { id: string; sourceSlotId: string | null; targetSlotId: string | null; status: "pending" | "applied" | "rejected" | "withdrawn" | "expired"; counterpartApproved: boolean; managerApproved: boolean; mine: boolean; canApprove: boolean; requestedAt: string };
export type DutySchedule = { series?: DutySeries[]; types: { id: string; name: string; active: boolean; revision: number }[]; isWork: boolean; canManage: boolean; claimRequiresApproval: boolean; changeRequiresApproval: boolean; selfServiceUntil: string; people: { id: string; name: string }[]; duties: Duty[]; requests: DutyRequest[] };

/** Split a local interval into shifts; the last shift may be shorter. */
export function createDutyIntervals(date: string, startTime: string, endTime: string, timeZone: string, minutes: number, places: number, instructions = "", opening = "", closing = "", endDate = date) {
 const start = localActivityTime(date, startTime, timeZone).getTime();
 const end = localActivityTime(endDate, endTime, timeZone).getTime();
 if (!Number.isFinite(minutes) || minutes < 5 || minutes % 5 || end <= start || Math.ceil((end-start)/(minutes*60000)) > 48) throw new Error("Välj ett giltigt intervall och högst 48 pass");
 const result: z.infer<typeof dutyDefinitionSchema>[] = [];
 for (let at = start; at < end; at += minutes * 60000) {
   const stop = Math.min(end, at + minutes * 60000);
   result.push(dutyDefinitionSchema.parse({ timingKind: "interval", startsAt: new Date(at).toISOString(), endsAt: new Date(stop).toISOString(), places, instructions: [instructions, at===start ? opening : "", stop===end ? closing : ""].filter(Boolean).join("\n") }));
 }
 return result;
}

/** Reject unsavable shifts before asking the user to confirm a schedule. */
export function validateDutyBounds(duties: { timingKind: string; startsAt: string | null; endsAt: string | null }[], startsAt: string, endsAt: string) {
 if (duties.some(d => d.timingKind === "interval" && (Date.parse(d.startsAt!) < Date.parse(startsAt) || Date.parse(d.endsAt!) > Date.parse(endsAt)))) {
   throw new Error("Bemanningspassen måste rymmas inom aktivitetens start och slut. Ändra aktivitetens tider eller korta schemat innan du sparar.");
 }
}
