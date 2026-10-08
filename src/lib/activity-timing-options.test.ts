import { describe, expect, it } from "vitest";
import { normalizeDefaultsPatch, resolveDisciplineDefaults, type DisciplineDefaultsRow } from "./discipline-defaults";
import { createTimingChoiceFilter, timingLabel, timingChoices } from "./activity-timing-options";
const context = {activityTypeId:"match",organizationId:"club",sectionId:"section",teamId:"team",disciplineId:"football-id"};
const row = (scope:DisciplineDefaultsRow["scope"], values:DisciplineDefaultsRow["values"]):DisciplineDefaultsRow => ({id:scope,activityTypeId:context.activityTypeId,organizationId:"club",scopeId:{section:"section",team:"team"}[scope],disciplineId:"football-id",version:"1.0.0",scope,revision:1,values});
describe("timing choices", () => {
  it("inherits options independently from selected defaults and tracks their source", () => {
    const result = resolveDisciplineDefaults(context, [row("section", {invitationRule:"start-3d",options:{invitationRule:["start-1d"],reminderRules:["deadline-1d"]}}), row("team", {reminderRules:[],options:{invitationRule:null,responseDueRule:["start-2h"]}})]);
    expect(result.rules.invitationRule).toBe("start-3d");
    expect(result.options.invitationRule).toEqual(["start-1d"]);
    expect(result.optionSources.invitationRule.scope).toBe("section");
    expect(result.options.reminderRules).toEqual(["deadline-1d"]);
    expect(result.rules.reminderRules).toEqual([]);
    expect(result.optionSources.responseDueRule.scope).toBe("team");
  });
  it("rejects invalid options even if overridden at a lower level", () => {
    for (const options of [[],{unknown:["start"]},{invitationRule:[]},{invitationRule:["start","start"]},{invitationRule:["deadline-1d"]},{reminderRules:["start-1d"]},{duration:["PT0M"]},{gatheringRule:[null]},{invitationRule:["start-367d"]},{invitationRule:Array.from({length:33},(_,i)=>`start-${i}h`)}]) expect(() => normalizeDefaultsPatch({options})).toThrow();
    expect(() => resolveDisciplineDefaults(context,[row("section",{options:{duration:[]}}),row("team",{options:{duration:["PT60M"]}})])).toThrow();
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
    const resolved = resolveDisciplineDefaults(context,[row("team",{options:{duration:["PT60M"]}})]);
    expect(resolved.rules.duration).toBe("PT90M");
  });
});


describe("schedule-aware lists", () => {
  const rules = { duration:"PT90M", gatheringRule:"start" as const, invitationRule:"start-3d" as const, responseDueRule:"start-6h" as const, reminderRules:["deadline-2h" as const] };
  const start = "2026-10-11T15:00:00Z";
  it("filters invitation and response choices against each other with strict boundaries", () => {
    const allowed = createTimingChoiceFilter(rules,[start],"Europe/Stockholm");
    expect(allowed("invitationRule","start-1d")).toBe(true);
    expect(allowed("invitationRule","start-6h")).toBe(false);
    expect(allowed("invitationRule","start-2h")).toBe(false);
    expect(allowed("responseDueRule","start-4d")).toBe(false);
    expect(allowed("responseDueRule","start-3d")).toBe(false);
    expect(allowed("responseDueRule","start")).toBe(true);
  });
  it("filters reminders at either boundary and those coinciding with another reminder", () => {
    const allowed = createTimingChoiceFilter(rules,[start],"Europe/Stockholm");
    expect(allowed("reminderRules","deadline-2h")).toBe(true);
    expect(allowed("reminderRules","deadline")).toBe(false);
    expect(allowed("reminderRules","deadline-66h")).toBe(false);
    expect(allowed("reminderRules","deadline-3d")).toBe(false);
    expect(allowed("reminderRules","deadline-120m",["deadline-2h"])).toBe(false);
  });
  it("checks all occurrences across DST instead of comparing nominal offsets", () => {
    const dstRules = {...rules, responseDueRule:"start-23h" as const};
    const ordinary = "2026-03-22T16:00:00Z", spring = "2026-03-29T15:00:00Z";
    expect(createTimingChoiceFilter(dstRules,[ordinary],"Europe/Stockholm")("invitationRule","start-1d")).toBe(true);
    expect(createTimingChoiceFilter(dstRules,[ordinary,spring],"Europe/Stockholm")("invitationRule","start-1d")).toBe(false);
    const fallRules = {...rules,responseDueRule:"start-1d" as const};
    const beforeFall = "2026-10-18T15:00:00Z", fall = "2026-10-25T16:00:00Z";
    expect(createTimingChoiceFilter(fallRules,[beforeFall],"Europe/Stockholm")("invitationRule","start-25h")).toBe(true);
    expect(createTimingChoiceFilter(fallRules,[beforeFall,fall],"Europe/Stockholm")("invitationRule","start-25h")).toBe(false);
  });
  it("uses actual local day start and does not mutate choices while dates change", () => {
    const dayRules = {...rules,responseDueRule:"start" as const};
    expect(createTimingChoiceFilter(dayRules,[start],"Europe/Stockholm")("invitationRule","start/d")).toBe(true);
    expect(createTimingChoiceFilter(dayRules,["2026-10-10T22:00:00Z"],"Europe/Stockholm")("invitationRule","start/d")).toBe(false);
    expect(dayRules.responseDueRule).toBe("start");
    expect(dayRules.invitationRule).toBe("start-3d");
  });
  it("does not let an invalid reminder lock the two anchor selectors", () => {
    const allowed = createTimingChoiceFilter({...rules,reminderRules:["deadline" as const]},[start],"Europe/Stockholm");
    expect(allowed("invitationRule","start-1d")).toBe(true);
    expect(allowed("responseDueRule","start-2h")).toBe(true);
  });
  it("rejects impossible configured choices but keeps day-start and other zero offsets", () => {
    for (const options of [{invitationRule:["start"]},{invitationRule:["start-0d-0h"]},{reminderRules:["deadline"]},{reminderRules:["deadline-0m"]}]) expect(() => normalizeDefaultsPatch({options})).toThrow();
    expect(() => normalizeDefaultsPatch({options:{invitationRule:["start/d"],reminderRules:["deadline-0h/d"],responseDueRule:["start"],gatheringRule:["start"]}})).not.toThrow();
    expect(timingLabel("invitationRule","start/d")).toBe("Vid början av aktivitetsdagen");
    expect(timingLabel("reminderRules","deadline-0h/d")).toBe("Vid början av dagen för sista svarstid");
  });
});
