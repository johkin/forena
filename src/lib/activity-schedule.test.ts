import { describe, expect, it } from "vitest";
import { buildInvitationSchedule, requireFutureSchedule } from "./activity-schedule";
import { FALLBACK_ACTIVITY_DEFAULTS } from "./activity-defaults";
import { previewRuleWeeklySeries } from "./activity-series";
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
