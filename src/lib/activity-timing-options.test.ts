import { describe, expect, it } from "vitest";
import { normalizeDefaultsPatch, resolveActivityDefaults, type ActivityDefaultsRow } from "./activity-defaults";
import { timingLabel, timingChoices } from "./activity-timing-options";
const context = {activityTypeId:"match",organizationId:"club",sectionId:"section",teamId:"team"};
const row = (scope: ActivityDefaultsRow["scope"], values: ActivityDefaultsRow["values"]): ActivityDefaultsRow => ({id:scope,activityTypeId:"match",scope,organizationId:scope === "system" ? null : "club",scopeId:{system:null,organization:"club",section:"section",team:"team"}[scope],revision:1,values});
describe("timing choices", () => {
  it("inherits options independently from selected defaults and tracks their source", () => {
    const result = resolveActivityDefaults(context, [row("system", {options:{invitationRule:["start-6d","start-7d"],reminderRules:["deadline-1d"]}}), row("organization", {invitationRule:"start-3d",options:{invitationRule:["start-1d"]}}), row("section", {options:{invitationRule:null}}), row("team", {reminderRules:[],options:{responseDueRule:["start-2h"]}})]);
    expect(result.rules.invitationRule).toBe("start-3d");
    expect(result.options.invitationRule).toEqual(["start-1d"]);
    expect(result.optionSources.invitationRule.scope).toBe("organization");
    expect(result.options.reminderRules).toEqual(["deadline-1d"]);
    expect(result.rules.reminderRules).toEqual([]);
    expect(result.optionSources.responseDueRule.scope).toBe("team");
  });
  it("rejects invalid options even if overridden at a lower level", () => {
    for (const options of [[],{unknown:["start"]},{invitationRule:[]},{invitationRule:["start","start"]},{invitationRule:["deadline-1d"]},{reminderRules:["start-1d"]},{duration:["PT0M"]},{gatheringRule:[null]},{invitationRule:["start-367d"]},{invitationRule:Array.from({length:33},(_,i)=>`start-${i}h`)}]) expect(() => normalizeDefaultsPatch({options})).toThrow();
    expect(() => resolveActivityDefaults(context,[row("system",{options:{duration:[]}}),row("team",{options:{duration:["PT60M"]}})])).toThrow();
    expect(normalizeDefaultsPatch({options:null})).toEqual({options:null});
  });
  it("renders Swedish labels without exposing stored expressions", () => {
    expect(timingLabel("invitationRule","start-6d")).toBe("6 dagar innan");
    expect(timingLabel("reminderRules","deadline-1d")).toBe("1 dag innan");
    expect(timingLabel("responseDueRule","start-1d/d")).toBe("1 dag innan · vid dagens början");
    expect(timingLabel("gatheringRule","start")).toBe("Vid start");
    expect(timingLabel("duration","PT1H30M")).toBe("90 minuter");
    expect(timingLabel("invitationRule","start-144h")).toBe("144 timmar innan");
    expect(timingLabel("invitationRule","start-1d-2h")).toBe("1 dag och 2 timmar innan");
  });
  it("keeps a current choice outside a changed option list with its exact internal value", () => {
    expect(timingChoices("invitationRule",["start-1d"],["start-6d"])).toEqual([{value:"start-1d",label:"1 dag innan"},{value:"start-6d",label:"6 dagar innan (nuvarande värde)"}]);
    const resolved = resolveActivityDefaults(context,[row("team",{options:{duration:["PT60M"]}})]);
    expect(resolved.rules.duration).toBe("PT90M");
  });
});
