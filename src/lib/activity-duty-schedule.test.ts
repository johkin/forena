import { describe, expect, it } from "vitest";
import { createDutyIntervals, dutyDefinitionSchema, dutyCommandSchema } from "./activity-duty-schedule";
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
