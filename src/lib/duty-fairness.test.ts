import { describe,expect,it } from "vitest";
import { suggestDutyAssignments, type DutyCandidate } from "./duty-fairness";
import { dutyCommandSchema, type DutySchedule } from "./activity-duty-schedule";
import { dutyNotificationContent } from "../../supabase/functions/_shared/duty-notification";
const person=(id:string, completed=0,lastType:string|null=null):DutyCandidate=>({personId:id,name:id,completed,lastType,byType:{}});
const schedule=(occupied=false)=>({people:[{id:"a",name:"A"},{id:"b",name:"B"}],duties:[{id:"d",name:"Städning",dutyTypeId:"clean",slots:[{id:"s1",revision:1,occupied,personId:occupied?"a":null},{id:"s2",revision:1,occupied:false,personId:null}]}]} as DutySchedule);
describe("duty distribution",()=>{
 it("prioritizes fewer completed tasks",()=>expect(suggestDutyAssignments(schedule(),[person("a",4),person("b",1)])[0].personId).toBe("b"));
 it("rotates the last task when totals are equal",()=>expect(suggestDutyAssignments(schedule(),[person("a",1,"clean"),person("b",1,"bake")])[0].personId).toBe("b"));
 it("preserves assignments and suggests only one per person",()=>expect(suggestDutyAssignments(schedule(true),[person("a"),person("b")]).map(r=>r.personId)).toEqual(["b"]));
 it("does not mutate inputs or invent extra eligible people",()=>{const s=schedule();const before=JSON.stringify(s);expect(suggestDutyAssignments(s,[person("other")])).toEqual([]);expect(JSON.stringify(s)).toBe(before);});
 it("leaves excess places unassigned",()=>expect(suggestDutyAssignments(schedule(),[person("a")])).toHaveLength(1));
 it("rejects invalid edit times and empty assignment batches",()=>{expect(dutyCommandSchema.safeParse({op:"assign_batch",assignments:[]}).success).toBe(false);expect(dutyCommandSchema.safeParse({op:"edit_duty",dutyId:crypto.randomUUID(),revision:1,definition:{timingKind:"interval",startsAt:"2026-10-06T12:00:00Z",endsAt:"2026-10-06T11:00:00Z",places:1}}).success).toBe(false);});
});
describe("duty notifications",()=>{
 it("distinguishes proposals from completed changes",()=>{expect(dutyNotificationContent("Café","pending").text).toContain("ändringsförslag");expect(dutyNotificationContent("Café","applied").text).toContain("genomförts");});
 it("does not describe duty updates as invitations",()=>{for(const reason of ["pending","applied","rejected","withdrawn","expired","assigned","edited","cancelled"]){const c=dutyNotificationContent("Café",reason);expect(c.subject).toBe("Bemanning: Café");expect(c.text).not.toContain("Du är kallad");}});
});
