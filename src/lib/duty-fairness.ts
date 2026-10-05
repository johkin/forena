import type { DutySchedule } from "./activity-duty-schedule";
export type DutyCandidate = { personId: string; name: string; completed: number; byType: Record<string, number>; lastType: string | null };
export type DutySuggestion = { slotId: string; dutyId: string; revision: number; personId: string; reason: string };
/** Deterministic and reviewable: one new assignment per person, preserving current assignments. */
export function suggestDutyAssignments(schedule: DutySchedule, candidates: DutyCandidate[]): DutySuggestion[] {
 const used = new Set(schedule.duties.flatMap(d => d.slots.flatMap(s => s.personId ? [s.personId] : [])));
 const eligible = new Set(schedule.people.map(p => p.id));
 const result: DutySuggestion[] = [];
 for (const duty of schedule.duties) {
   for (const slot of duty.slots) {
     if (slot.occupied || slot.completedAt || result.length >= 100) continue;
     const candidate = candidates.filter(p => eligible.has(p.personId) && !used.has(p.personId)).sort((a,b) =>
       a.completed-b.completed || Number(a.lastType===duty.dutyTypeId)-Number(b.lastType===duty.dutyTypeId) ||
       (a.byType[duty.dutyTypeId]??0)-(b.byType[duty.dutyTypeId]??0) || a.name.localeCompare(b.name,"sv") || a.personId.localeCompare(b.personId))[0];
     if (!candidate) continue;
     used.add(candidate.personId);
     result.push({ slotId: slot.id, dutyId: duty.id, revision: slot.revision, personId: candidate.personId,
       reason: `${candidate.completed} genomförda uppgifter under perioden, varav ${candidate.byType[duty.dutyTypeId]??0} av denna typ. ${candidate.lastType===duty.dutyTypeId ? "Samma uppgift senast." : candidate.lastType ? "Annan uppgift senast." : "Ingen genomförd uppgift registrerad under perioden."}` });
   }
 }
 return result;
}
