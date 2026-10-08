import { describe, expect, it } from "vitest";
import { normalizeDefaultsPatch } from "./activity-configuration";
import { applyUntouchedDefaults } from "./activity-editor-defaults";
import { resolveDisciplineDefaults, type DisciplineDefaultsRow } from "./discipline-defaults";
const context = {activityTypeId:"training",organizationId:"club",sectionId:"football",teamId:"girls",disciplineId:"football-id"};
const row = (scope:DisciplineDefaultsRow["scope"], values:DisciplineDefaultsRow["values"]):DisciplineDefaultsRow => ({id:scope,activityTypeId:context.activityTypeId,organizationId:"club",scopeId:{section:"football",team:"girls"}[scope],disciplineId:"football-id",version:"1.0.0",scope,revision:1,values});
describe("activity configuration",()=>{
 it("resolves per-field sources, explicit zero and an empty reminder list",()=>{
  const result=resolveDisciplineDefaults(context,[row("section",{duration:"PT75M",gatheringRule:"start-30m",invitationRule:"start-7d"}),row("team",{gatheringRule:"start",reminderRules:[]})]);
  expect(result.rules).toMatchObject({duration:"PT75M",gatheringRule:"start",invitationRule:"start-7d",reminderRules:[]});
  expect(result.sources.duration.scope).toBe("section");expect(result.sources.gatheringRule.scope).toBe("team");
 });
 it("keeps user-entered and explicit draft values when switching type",()=>{
  const current=resolveDisciplineDefaults(context,[]).rules;
  const defaults=resolveDisciplineDefaults(context,[row("section",{duration:"PT60M",gatheringRule:"start-30m"})]);
  expect(applyUntouchedDefaults(current,defaults,new Set(["duration"]))).toMatchObject({duration:current.duration,gatheringRule:"start-30m"});
 });
 it("null restores inheritance rather than disabling reminders",()=>{
  const result=resolveDisciplineDefaults(context,[row("section",{duration:"PT60M"}),row("team",{duration:null,reminderRules:null})]);expect(result.rules.duration).toBe("PT60M");expect(result.rules.reminderRules).toHaveLength(2);
 });
 it("rejects unknown fields and malformed rule payloads",()=>{
  for(const input of [[],{duration:0},{unknown:"value"},{reminderRules:["start-2h"]},{duration:"PT0M"},{invitationRule:"start-367d"}]) expect(()=>normalizeDefaultsPatch(input)).toThrow();
 });
 it("accepts sparse overrides and explicit no reminders",()=>expect(normalizeDefaultsPatch({duration:null,reminderRules:[]})).toEqual({duration:null,reminderRules:[]}));
});

import { vi } from "vitest";
import { loadActivityConfiguration } from "./activity-configuration";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

function configurationClient(catalogueError = false, override: string | null = null) {
 const data: Record<string, unknown> = {
  teams:{id:"team",organization_id:"club",section_id:"section",discipline_id:override},
  organizations:{discipline_id:null,time_zone:"Europe/Stockholm"},
  sections:{discipline_id:"football-id"},
  disciplines:[{id:"football-id",key:"football"}],
  activity_types:[{id:"generic",active:true,discipline_id:null,slug:"ovrigt"},{id:"match",active:true,discipline_id:"football-id"},{id:"other",active:true,discipline_id:"floorball-id"}],
  section_discipline_defaults:[], team_discipline_defaults:[],
 };
 return {from:vi.fn((table:string)=>{
  const result = {data:data[table],error:table==="disciplines" && catalogueError ? {message:"failure"}:null};
  const query: Record<string, unknown> = {then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(result).then(resolve)};
  for (const method of ["select","eq","single","order","or"]) query[method]=()=>query;
  return query;
 })} as unknown as SupabaseClient<Database>;
}
describe("section discipline integration",()=>{
 it("loads the section's code package and retains generic activity types",async()=>{
  const config=await loadActivityConfiguration(configurationClient(),"team");
  expect(config.disciplinePackage?.key).toBe("football");
  expect(config.types.map(t=>t.id)).toEqual(["generic","match"]);
 });
 it("uses section discipline even when a legacy team override exists",async()=>{
  const config=await loadActivityConfiguration(configurationClient(false,"floorball-id"),"team");
  expect(config.disciplinePackage?.key).toBe("football");
  expect(config.types.map(t=>t.id)).toEqual(["generic","match"]);
 });
 it("fails closed when the discipline catalogue cannot be read",async()=>{
  await expect(loadActivityConfiguration(configurationClient(true),"team")).rejects.toThrow();
 });
});

describe("capability defaults inheritance", () => {
 const match = {...context,activityTypeSlug:"match-tavling",activityCategory:"competition",disciplineKey:"football"};
 const settings = (scope:DisciplineDefaultsRow["scope"], values:NonNullable<DisciplineDefaultsRow["values"]["capabilities"]>) => row(scope,{capabilities:values});
 it("starts disabled with code-owned checkpoints and resolves each field separately", () => {
  expect(resolveDisciplineDefaults(match,[]).capabilities.targetTeamSize).toEqual({notificationsEnabled:false,notificationHours:[72,24]});
  const resolved=resolveDisciplineDefaults(match,[settings("section",{targetTeamSize:{notificationsEnabled:true,notificationHours:[168,72]}}),settings("team",{targetTeamSize:{notificationsEnabled:false,notificationHours:null}})]);
  expect(resolved.capabilities.targetTeamSize).toEqual({notificationsEnabled:false,notificationHours:[168,72]});
  expect(resolved.capabilitySources.notificationHours?.scope).toBe("section");
  expect(resolved.capabilitySources.notificationsEnabled?.scope).toBe("team");
 });
 it("treats null as inheritance, empty lists as no checks, and ignores another discipline's rows", () => {
  const resolved=resolveDisciplineDefaults(match,[settings("section",{targetTeamSize:{notificationsEnabled:true}}),settings("team",{targetTeamSize:{notificationsEnabled:null,notificationHours:[]}})]);
  expect(resolved.capabilities.targetTeamSize).toEqual({notificationsEnabled:true,notificationHours:[]});
  expect(resolveDisciplineDefaults(match,[{...row("team",{duration:"PT30M"}),disciplineId:"other"}]).rules.duration).toBe("PT90M");
 });
 it("rejects sport/type-inapplicable and malformed capability settings", () => {
  const enabled={capabilities:{targetTeamSize:{notificationsEnabled:true}}};
  for (const ctx of [{...match,disciplineKey:"swimming"},{...match,activityTypeSlug:"traning"},{...match,activityCategory:"session"}]) {
   expect(resolveDisciplineDefaults(ctx,[]).capabilities).toEqual({});
   expect(()=>normalizeDefaultsPatch(enabled,ctx)).toThrow();
  }
  for (const notificationHours of [[0],[24,24],[1.5],[721],Array.from({length:6},(_,i)=>i+1)]) expect(()=>normalizeDefaultsPatch({capabilities:{targetTeamSize:{notificationHours}}},match)).toThrow();
  expect(()=>normalizeDefaultsPatch({capabilities:{targetTeamSize:{notificationsEnabled:"yes"}}},match)).toThrow();
  expect(()=>normalizeDefaultsPatch({capabilities:{unknown:{}}},match)).toThrow();
 });
 it("rejects unsupported saved versions and copies checkpoint lists", () => {
  expect(()=>resolveDisciplineDefaults(match,[{...row("team",{}),version:"2.0.0"}])).toThrow();
  const input=settings("team",{targetTeamSize:{notificationHours:[48]}});
  resolveDisciplineDefaults(match,[input]).capabilities.targetTeamSize!.notificationHours.push(24);
  expect(resolveDisciplineDefaults(match,[input]).capabilities.targetTeamSize!.notificationHours).toEqual([48]);
 });
});
