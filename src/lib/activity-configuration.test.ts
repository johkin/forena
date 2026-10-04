import { describe, expect, it } from "vitest";
import { normalizeDefaultsPatch } from "./activity-configuration";
import { applyUntouchedDefaults } from "./activity-editor-defaults";
import { resolveActivityDefaults, type ActivityDefaultsRow } from "./activity-defaults";
const context = {activityTypeId:"training",organizationId:"club",sectionId:"football",teamId:"girls"};
const row = (scope:ActivityDefaultsRow["scope"], values:ActivityDefaultsRow["values"]):ActivityDefaultsRow=>({id:scope,activityTypeId:"training",organizationId:scope==="system"?null:"club",scopeId:{system:null,organization:"club",section:"football",team:"girls"}[scope],scope,revision:1,values});
describe("activity configuration",()=>{
 it("resolves per-field sources, explicit zero and an empty reminder list",()=>{
  const result=resolveActivityDefaults(context,[row("system",{duration:"PT60M",gatheringRule:"start-30m"}),row("organization",{invitationRule:"start-7d"}),row("section",{duration:"PT75M"}),row("team",{gatheringRule:"start",reminderRules:[]})]);
  expect(result.rules).toMatchObject({duration:"PT75M",gatheringRule:"start",invitationRule:"start-7d",reminderRules:[]});
  expect(result.sources.duration.scope).toBe("section");expect(result.sources.gatheringRule.scope).toBe("team");
 });
 it("keeps user-entered and explicit draft values when switching type",()=>{
  const current=resolveActivityDefaults(context,[]).rules;
  const defaults=resolveActivityDefaults(context,[row("system",{duration:"PT60M",gatheringRule:"start-30m"})]);
  expect(applyUntouchedDefaults(current,defaults,new Set(["duration"]))).toMatchObject({duration:current.duration,gatheringRule:"start-30m"});
 });
 it("null restores inheritance rather than disabling reminders",()=>{
  const result=resolveActivityDefaults(context,[row("system",{duration:"PT60M"}),row("team",{duration:null,reminderRules:null})]);expect(result.rules.duration).toBe("PT60M");expect(result.rules.reminderRules).toHaveLength(2);
 });
 it("rejects unknown fields and malformed rule payloads",()=>{
  for(const input of [[],{duration:0},{unknown:"value"},{reminderRules:["start-2h"]},{duration:"PT0M"},{invitationRule:"start-367d"}]) expect(()=>normalizeDefaultsPatch(input)).toThrow();
 });
 it("accepts sparse overrides and explicit no reminders",()=>expect(normalizeDefaultsPatch({duration:null,reminderRules:[]})).toEqual({duration:null,reminderRules:[]}));
});
