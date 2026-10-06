import { describe, expect, it } from "vitest";
import { createDutyIntervals, dutyDefinitionSchema, dutyCommandSchema, dutySeriesDefinitionSchema, expandDutySeries } from "./activity-duty-schedule";
describe("duty schedules", () => {
 it("creates five two-hour shifts with opening/closing instructions only at the boundaries", () => {
   const shifts=createDutyIntervals("2026-10-10","08:00","18:00","Europe/Stockholm",120,3,"Servera","Öppna","Städa");
   expect(shifts).toHaveLength(5); expect(shifts[0].startsAt).toBe("2026-10-10T06:00:00.000Z");
   expect(shifts[0].instructions).toBe("Servera\nÖppna"); expect(shifts[2].instructions).toBe("Servera"); expect(shifts[4].instructions).toBe("Servera\nStäda");
 });
 it("preserves the final shorter shift",()=>{const s=createDutyIntervals("2026-10-10","08:00","13:00","Europe/Stockholm",120,2);expect(s).toHaveLength(3);expect(new Date(s[2].endsAt!).getTime()-new Date(s[2].startsAt!).getTime()).toBe(3600000);});
 it("allows baking with only a deadline and duties without times",()=>{
   expect(dutyDefinitionSchema.safeParse({timingKind:"deadline",dueAt:"2026-10-10T06:00:00Z",places:4}).success).toBe(true);
   expect(dutyDefinitionSchema.safeParse({timingKind:"none",places:4}).success).toBe(true);
 });
 it("rejects mixed or incomplete time semantics",()=>{
   expect(dutyDefinitionSchema.safeParse({timingKind:"interval",startsAt:"2026-10-10T06:00:00Z",places:4}).success).toBe(false);
   expect(dutyDefinitionSchema.safeParse({timingKind:"none",dueAt:"2026-10-10T06:00:00Z",places:4}).success).toBe(false);
 });
 it("requires explicit person and target for a claim",()=>{expect(dutyCommandSchema.safeParse({op:"claim"}).success).toBe(false);});
 it("rejects an inverted schedule",()=>{expect(()=>createDutyIntervals("2026-10-10","18:00","08:00","Europe/Stockholm",120,3)).toThrow();});
});

 describe("bulk cancellation", () => {
   const duty = { dutyId: "a0000000-0000-4000-8000-000000000001", revision: 2 };
   it("accepts multiple distinct duties with revisions", () => {
     expect(dutyCommandSchema.safeParse({ op: "cancel_duties", duties: [duty, { ...duty, dutyId: "a0000000-0000-4000-8000-000000000002" }] }).success).toBe(true);
   });
   it("rejects empty, duplicate, oversized and unversioned selections", () => {
     for (const duties of [[], [duty, duty], [{ dutyId: duty.dutyId }], [{ ...duty, revision: 0 }], Array.from({ length: 101 }, (_, i) => ({ ...duty, dutyId: `a0000000-0000-4000-8000-${String(i).padStart(12, "0")}` }))]) {
       expect(dutyCommandSchema.safeParse({ op: "cancel_duties", duties }).success).toBe(false);
     }
   });
 });

 describe("duty series templates", () => {
   const definition = dutySeriesDefinitionSchema.parse({ timingKind: "interval", startsAt: "2026-10-10T06:00:00Z", endsAt: "2026-10-10T16:00:00Z", intervalMinutes: 120, places: 3, instructions: "Servera", openingInstructions: "Öppna", closingInstructions: "Stäng" });
   it("materializes five instances of the same template", () => {
     const duties = expandDutySeries(definition);
     expect(duties).toHaveLength(5); expect(duties.map(d => d.places)).toEqual([3, 3, 3, 3, 3]);
     expect(duties[0].instructions).toBe("Servera\nÖppna"); expect(duties[4].instructions).toBe("Servera\nStäng");
   });
   it("regenerates the series when changing interval length", () => {
     expect(expandDutySeries({ ...definition, intervalMinutes: 60 })).toHaveLength(10);
     const duties = expandDutySeries({ ...definition, intervalMinutes: 180 });
     expect(duties).toHaveLength(4); expect(duties[3].endsAt).toBe("2026-10-10T16:00:00.000Z");
   });
   it("represents a legacy interval as one full instance", () => {
     expect(expandDutySeries({ ...definition, intervalMinutes: null })).toHaveLength(1);
   });
   it("supports deadline and untimed singleton series", () => {
     for (const value of [{ timingKind: "deadline", dueAt: "2026-10-10T06:00:00Z", places: 2 }, { timingKind: "none", places: 2 }]) {
       expect(expandDutySeries(dutySeriesDefinitionSchema.parse(value))).toHaveLength(1);
     }
   });
   it("rejects excessive splitting and interval settings on untimed series", () => {
     expect(dutySeriesDefinitionSchema.safeParse({ ...definition, intervalMinutes: 5 }).success).toBe(false);
     expect(dutySeriesDefinitionSchema.safeParse({ timingKind: "none", intervalMinutes: 120, places: 3 }).success).toBe(false);
     expect(() => expandDutySeries({ ...definition, instructions: "x".repeat(2000) })).toThrow();
   });
   it("requires a revision to edit or cancel a whole series", () => {
     expect(dutyCommandSchema.safeParse({ op: "edit_series", seriesId: "a0000000-0000-4000-8000-000000000001", definition }).success).toBe(false);
     expect(dutyCommandSchema.safeParse({ op: "cancel_series", seriesId: "a0000000-0000-4000-8000-000000000001", revision: 3 }).success).toBe(true);
   });
 });
