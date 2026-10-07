import { describe, expect, it } from "vitest";
import { buildInvitationSchedule, prepareInvitationSchedule, requireFutureSchedule } from "./activity-schedule";
import { FALLBACK_ACTIVITY_DEFAULTS } from "./activity-defaults";
import { previewRuleWeeklySeries } from "./activity-series";
import type { ActivityTimingRules } from "./activity-time-rules";
describe("persistable activity schedules",()=>{
 it("preserves all reminders for the legacy multi-reminder request",()=>{
  const result=buildInvitationSchedule("2026-11-05T17:00:00Z","Europe/Stockholm",{reminderMinutesBeforeDueList:[1440,120]});expect(result.reminderSendAts).toHaveLength(2);expect(result.reminderSendAt).toBeNull();
 });
 it("computes rule times separately across winter time",()=>{
  const rules={...FALLBACK_ACTIVITY_DEFAULTS,reminderRules:[...FALLBACK_ACTIVITY_DEFAULTS.reminderRules]};
  const dates=previewRuleWeeklySeries({startsOn:"2026-10-20",endsOn:"2026-10-27",weekdays:[2],startTime:"18:00",timeZone:"Europe/Stockholm",rules});
  expect(dates.map(d=>d.startsAt)).toEqual(["2026-10-20T16:00:00.000Z","2026-10-27T17:00:00.000Z"]);
  expect(dates.map(d=>d.invitationSendAt)).toEqual(["2026-10-14T16:00:00.000Z","2026-10-21T16:00:00.000Z"]);
 });
 it.each([{offsets:[0]},{offsets:[-1]},{offsets:[1.5]},{offsets:[1440,1440]},{offsets:[1,2,3,4,5,6]}])("rejects invalid offsets %s", ({offsets})=>expect(()=>buildInvitationSchedule("2026-11-05T17:00:00Z","Europe/Stockholm",{reminderMinutesBeforeDueList:offsets})).toThrow());
 it("rejects past schedules rather than silently sending",()=>{
  const result=buildInvitationSchedule("2026-11-05T17:00:00Z","Europe/Stockholm",{});expect(()=>requireFutureSchedule(result,Date.parse("2026-11-06T00:00:00Z"))).toThrow();
 });
 it("keeps an explicit empty reminder list",()=>expect(buildInvitationSchedule("2026-11-05T17:00:00Z","Europe/Stockholm",{reminderMinutesBeforeDueList:[]}).reminderSendAts).toEqual([]));
});

describe("late invitation times in new series", () => {
 const now = Date.parse("2026-10-06T10:00:00Z");
 const rules: ActivityTimingRules = { ...FALLBACK_ACTIVITY_DEFAULTS, invitationRule:"start-6d", responseDueRule:"start-6h", reminderRules:["deadline-5d","deadline-2d"] };
 it("sends the first occurrence immediately while retaining future occurrences across DST", () => {
  const previews = previewRuleWeeklySeries({startsOn:"2026-10-09",endsOn:"2026-10-30",weekdays:[5],startTime:"16:15",timeZone:"Europe/Stockholm",rules});
  const schedules = previews.map(item=>prepareInvitationSchedule({...item,reminderSendAt:null},now));
  expect(schedules[0]).toMatchObject({sendImmediately:true,invitationSendAt:"2026-10-06T10:00:00.000Z",reminderSendAts:["2026-10-07T08:15:00.000Z"]});
  expect(schedules[1]).toMatchObject({sendImmediately:false,invitationSendAt:"2026-10-10T14:15:00.000Z"});
  expect(schedules[3].invitationSendAt).toBe("2026-10-24T14:15:00.000Z");
  expect(schedules[3].startsAt).toBe("2026-10-30T15:15:00.000Z");
 });
 it("also accepts an invitation time equal to now and removes reminders at now", () => {
  const schedule = {invitationSendAt:"2026-10-06T10:00:00Z",responseDueAt:"2026-10-07T10:00:00Z",reminderSendAt:null,reminderSendAts:["2026-10-06T10:00:00Z"]};
  expect(prepareInvitationSchedule(schedule,now)).toMatchObject({sendImmediately:true,reminderSendAts:[]});
 });
 it("rejects an elapsed answer deadline instead of sending an unanswerable invitation", () => {
  const schedule=buildInvitationSchedule("2026-10-06T11:00:00Z","Europe/Stockholm",{timingRules:rules});
  expect(()=>prepareInvitationSchedule(schedule,now)).toThrow("Sista svarstid har passerat");
 });
 it("does not alter the timing rules or the original preview", () => {
  const schedule=buildInvitationSchedule("2026-10-09T14:15:00Z","Europe/Stockholm",{timingRules:rules});
  const original=structuredClone(schedule);
  prepareInvitationSchedule(schedule,now);
  expect(schedule).toEqual(original);
  expect(rules.invitationRule).toBe("start-6d");
 });
});
