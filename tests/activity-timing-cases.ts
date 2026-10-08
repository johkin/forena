import { ActivityTimingError, durationToMinutes, evaluateTimeRule, inspectScheduleAgainstNow, localActivityTime, normalizeActivityTimingRules, parseActivityInstant, parseTimeRule, scheduleActivityTimes, type ActivityTimingRules } from "../src/lib/activity-time-rules";
import { resolveDisciplineDefaults, type DisciplineDefaultsRow, type DisciplineDefaultsPatch } from "../src/lib/discipline-defaults";
import { invitationScheduleForOccurrence, previewRuleWeeklySeries, previewRuleSingleActivity, previewWeeklySeries } from "../src/lib/activity-series";

export type TimingCase = { name: string; run: () => void };
export const timingCases: TimingCase[] = [];
const add = (name: string, run: () => void) => timingCases.push({ name, run });
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}
function throws(action: () => unknown, code?: string) {
  try { action(); } catch (error) {
    if (code && (!(error instanceof ActivityTimingError) || error.code !== code)) throw error;
    return;
  }
  throw new Error("Expected error");
}
const rules: ActivityTimingRules = { duration: "PT1H30M", gatheringRule: "start-10m", invitationRule: "start-6d", responseDueRule: "start/d", reminderRules: ["deadline-1d", "deadline-2h"] };
const start = "2026-10-08T16:00:00Z";
const zone = "Europe/Stockholm";
const context = { start, deadline: "2026-10-07T22:00:00Z", timeZone: zone };
for (const [rule, expected] of [
  ["start", "2026-10-08T16:00:00.000Z"],
  ["start-0m", "2026-10-08T16:00:00.000Z"],
  ["start-10m", "2026-10-08T15:50:00.000Z"],
  ["start-6d", "2026-10-02T16:00:00.000Z"],
  ["start-6h", "2026-10-08T10:00:00.000Z"],
  ["start/d", "2026-10-07T22:00:00.000Z"],
  ["start-1d/d", "2026-10-06T22:00:00.000Z"],
  ["start-1d-2h", "2026-10-07T14:00:00.000Z"],
  ["deadline-1d", "2026-10-06T22:00:00.000Z"],
  ["deadline-2h", "2026-10-07T20:00:00.000Z"],
  ["deadline/d", "2026-10-07T22:00:00.000Z"],
]) add(`date math ${rule}`, () => equal(evaluateTimeRule(rule, context), expected));

const dstCases = [
  ["spring calendar day", "2026-03-29T16:00:00Z", zone, "start-1d", "2026-03-28T17:00:00.000Z"],
  ["spring elapsed 24 hours", "2026-03-29T16:00:00Z", zone, "start-24h", "2026-03-28T16:00:00.000Z"],
  ["autumn six calendar days", "2026-10-28T17:00:00Z", zone, "start-6d", "2026-10-22T16:00:00.000Z"],
  ["autumn elapsed 144 hours", "2026-10-28T17:00:00Z", zone, "start-144h", "2026-10-22T17:00:00.000Z"],
  ["autumn midnight before offset changes", "2026-10-25T17:00:00Z", zone, "start/d", "2026-10-24T22:00:00.000Z"],
  ["calendar gap moves forward", "2026-03-30T00:30:00Z", zone, "start-1d", "2026-03-29T01:30:00.000Z"],
  ["calendar overlap uses earlier instant", "2026-10-26T01:30:00Z", zone, "start-1d", "2026-10-25T00:30:00.000Z"],
  ["New York calendar day", "2026-03-08T22:00:00Z", "America/New_York", "start-1d", "2026-03-07T23:00:00.000Z"],
  ["Kathmandu quarter-hour offset", "2026-01-07T12:00:00Z", "Asia/Kathmandu", "start/d", "2026-01-06T18:15:00.000Z"],
  ["Lord Howe half-hour DST", "2026-04-05T08:00:00Z", "Australia/Lord_Howe", "start-1d", "2026-04-04T07:30:00.000Z"],
  ["Sao Paulo skipped midnight", "2018-11-04T14:00:00Z", "America/Sao_Paulo", "start/d", "2018-11-04T03:00:00.000Z"],
  ["leap day", "2024-03-01T17:00:00Z", zone, "start-1d", "2024-02-29T17:00:00.000Z"],
  ["year boundary", "2026-01-01T17:00:00Z", zone, "start-1d/d", "2025-12-30T23:00:00.000Z"],
];
for (const [name, anchor, timeZone, rule, expected] of dstCases) add(name, () => equal(evaluateTimeRule(rule, { start: anchor, timeZone }), expected));
add("preserve milliseconds", () => equal(evaluateTimeRule("start-1d", { start: "2026-03-29T16:01:02.345Z", timeZone: zone }), "2026-03-28T17:01:02.345Z"));
add("offset input equivalent to Z", () => equal(evaluateTimeRule("start/d", { start: "2026-10-08T18:00:00+02:00", timeZone: zone }), evaluateTimeRule("start/d", context)));

for (const bad of ["now/d", "start+1d", "start-1w", "start-1M", "start-1y", "start-1.5h", "start/d-1h", "start-1d/d/d", "start--1h", "start -1h", " start-1h", "start-1h ", "start;process.exit()", "start-999999m", "start-1m-1m-1m-1m-1m", "start/__proto__", "deadline=start", "", null, 123, {}, "x".repeat(81)]) {
  add(`reject malformed rule ${JSON.stringify(bad)}`, () => throws(() => parseTimeRule(bad)));
}
add("reject cyclic/wrong anchor", () => throws(() => parseTimeRule("deadline-2h", "start"), "anchor"));
add("require deadline", () => throws(() => evaluateTimeRule("deadline-2h", { start, timeZone: zone }), "deadline-missing"));
add("reject invalid time zone", () => throws(() => evaluateTimeRule("start", { start, timeZone: "Unknown/Zone" }), "time-zone"));
for (const bad of ["2026-02-30T16:00:00Z", "2026-10-08T16:00:00", "2026-10-08", "2026-13-01T16:00Z", "2026-10-08T24:00:00Z", "2026-10-08T16:00:00+25:00", "2026-10-08T16:00:00+01:61", "bad"]) {
  add(`reject invalid instant ${bad}`, () => throws(() => parseActivityInstant(bad)));
}
add("valid local time", () => equal(localActivityTime("2026-10-08", "18:00", zone).toISOString(), "2026-10-08T16:00:00.000Z"));
add("reject nonexistent form time", () => throws(() => localActivityTime("2026-03-29", "02:30", zone), "nonexistent-local-time"));
add("repeated form time chooses earlier", () => equal(localActivityTime("2026-10-25", "02:30", zone).toISOString(), "2026-10-25T00:30:00.000Z"));
add("reject overflowed form date", () => throws(() => localActivityTime("2026-02-30", "18:00", zone)));
for (const [duration, minutes] of [["PT1H30M", 90], ["PT90M", 90], ["PT1M", 1], ["PT24H", 1440], ["PT0H10M", 10]] as const) {
  add(`duration ${duration}`, () => equal(durationToMinutes(duration), minutes));
}
for (const bad of ["PT", "P6D", "P1M", "PT0M", "PT169H", "PT1.5H", "-PT1H", "PT1S", "90", null, {}]) add(`reject duration ${JSON.stringify(bad)}`, () => throws(() => durationToMinutes(bad), "duration"));

add("complete schedule resolves all timestamps", () => {
  const actual = scheduleActivityTimes(start, zone, rules);
  equal(actual.startsAt, "2026-10-08T16:00:00.000Z");
  equal(actual.endsAt, "2026-10-08T17:30:00.000Z");
  equal(actual.gatheringAt, "2026-10-08T15:50:00.000Z");
  equal(actual.invitationSendAt, "2026-10-02T16:00:00.000Z");
  equal(actual.responseDueAt, "2026-10-07T22:00:00.000Z");
  equal(actual.reminderSendAts, ["2026-10-06T22:00:00.000Z", "2026-10-07T20:00:00.000Z"]);
});
add("no gathering and no reminders are explicit", () => {
  const result = scheduleActivityTimes(start, zone, { ...rules, gatheringRule: "start", reminderRules: [] });
  equal(result.gatheringAt, null); equal(result.reminderSendAts, []);
});
add("sort reminders by concrete instant", () => equal(scheduleActivityTimes(start, zone, { ...rules, reminderRules: [...rules.reminderRules].reverse() }).reminderSendAts, scheduleActivityTimes(start, zone, rules).reminderSendAts));
add("detect semantically duplicate reminders", () => throws(() => scheduleActivityTimes(start, zone, { ...rules, reminderRules: ["deadline-2h", "deadline-120m"] }), "reminders"));
add("reject duplicate reminder text", () => throws(() => normalizeActivityTimingRules({ ...rules, reminderRules: ["deadline-2h", "deadline-2h"] }), "reminders"));
add("reject more than five reminders", () => throws(() => normalizeActivityTimingRules({ ...rules, reminderRules: Array.from({ length: 6 }, (_, i) => `deadline-${i+1}h`) }), "reminders"));
add("reminder cannot be at deadline", () => throws(() => scheduleActivityTimes(start, zone, { ...rules, reminderRules: ["deadline"] }), "ordering"));
add("reminder cannot precede invitation", () => throws(() => scheduleActivityTimes(start, zone, { ...rules, reminderRules: ["deadline-9d"] }), "ordering"));
add("invitation must precede deadline", () => throws(() => scheduleActivityTimes(start, zone, { ...rules, invitationRule: "start-1h" }), "ordering"));
add("invitation cannot equal deadline", () => throws(() => scheduleActivityTimes(start, zone, { ...rules, invitationRule: "start/d" }), "ordering"));
add("rules reject unknown fields including mode/audience", () => throws(() => normalizeActivityTimingRules({ ...rules, invitationMode: "now" }), "rules"));
add("flags past sends without rescheduling", () => {
  const schedule = scheduleActivityTimes(start, zone, rules);
  const before = JSON.stringify(schedule);
  const state = inspectScheduleAgainstNow(schedule, "2026-10-07T00:00:00Z");
  equal(state, { invitationInPast: true, deadlinePassed: false, passedReminderTimes: ["2026-10-06T22:00:00.000Z"] });
  equal(JSON.stringify(schedule), before);
});

const target = { activityTypeId: "type", organizationId: "org", sectionId: "section", teamId: "team", disciplineId: "football" };
const row = (scope: DisciplineDefaultsRow["scope"], values: DisciplineDefaultsPatch): DisciplineDefaultsRow => ({id:scope,scope,organizationId:"org",scopeId:scope,disciplineId:"football",version:"1.0.0",activityTypeId:"type",revision:1,values});
add("field-wise defaults and provenance", () => {
  const resolved = resolveDisciplineDefaults(target, [row("team", { gatheringRule: "start-10m", duration: null }), row("section", { duration: "PT90M", gatheringRule: "start-15m" })]);
  equal(resolved.rules.duration, "PT90M"); equal(resolved.rules.gatheringRule, "start-10m");
  equal(resolved.sources.duration.scope, "section"); equal(resolved.sources.gatheringRule.scope, "team");
});
add("empty reminder list disables inherited list", () => equal(resolveDisciplineDefaults(target, [row("team", { reminderRules: [] })]).rules.reminderRules, []));
add("NULL reminder list inherits", () => equal(resolveDisciplineDefaults(target, [row("team", { reminderRules: null })]).rules.reminderRules, ["deadline-1d", "deadline-2h"]));
add("local reminder list replaces instead of merges", () => equal(resolveDisciplineDefaults(target, [row("section", { reminderRules: ["deadline-1d"] }), row("team", { reminderRules: ["deadline-1h"] })]).rules.reminderRules, ["deadline-1h"]));
add("zero offset overrides instead of inheriting", () => equal(resolveDisciplineDefaults(target, [row("team", { gatheringRule: "start-0m" })]).rules.gatheringRule, "start-0m"));
add("other tenant rows do not affect defaults", () => equal(resolveDisciplineDefaults(target, [{ ...row("team", { duration: "PT30M" }), organizationId: "other" }]).rules.duration, "PT90M"));
add("other team rows do not affect defaults", () => equal(resolveDisciplineDefaults(target, [{ ...row("team", { duration: "PT30M" }), scopeId: "other" }]).rules.duration, "PT90M"));
add("other type rows do not affect defaults", () => equal(resolveDisciplineDefaults(target, [{ ...row("section", { duration: "PT30M" }), activityTypeId: "other" }]).rules.duration, "PT90M"));
add("other section target does not affect defaults", () => equal(resolveDisciplineDefaults(target, [{ ...row("section", { duration: "PT30M" }), scopeId: "other" }]).rules.duration, "PT90M"));
add("duplicate rows fail instead of non-deterministic last write", () => throws(() => resolveDisciplineDefaults(target, [row("team", {}), row("team", {})])));
add("unknown defaults fields fail", () => throws(() => resolveDisciplineDefaults(target, [row("team", { invitationMode: "now" } as DisciplineDefaultsPatch)])));
add("inherited combination checked on actual date", () => {
  const resolved = resolveDisciplineDefaults(target, [row("team", { invitationRule: "start-1h" })]);
  throws(() => scheduleActivityTimes(start, zone, resolved.rules), "ordering");
});
add("returned reminder array cannot mutate next resolution", () => {
  const first = resolveDisciplineDefaults(target, []); first.rules.reminderRules.length = 0;
  equal(resolveDisciplineDefaults(target, []).rules.reminderRules.length, 2);
});

add("weekly rule preview recalculates each DST occurrence", () => {
  const results = previewRuleWeeklySeries({ startsOn: "2026-10-21", endsOn: "2026-10-28", weekdays: [3], startTime: "18:00", timeZone: zone, rules });
  equal(results.map(r => r.startsAt), ["2026-10-21T16:00:00.000Z", "2026-10-28T17:00:00.000Z"]);
  equal(results.map(r => r.responseDueAt), ["2026-10-20T22:00:00.000Z", "2026-10-27T23:00:00.000Z"]);
  equal(results.map(r => r.invitationSendAt), ["2026-10-15T16:00:00.000Z", "2026-10-22T16:00:00.000Z"]);
});
add("single rule preview matches schedule", () => equal(previewRuleSingleActivity({ startsOn: "2026-10-08", startTime: "18:00", timeZone: zone, rules }).responseDueAt, "2026-10-07T22:00:00.000Z"));
add("rule-aware invitation helper includes complete reminders", () => equal(invitationScheduleForOccurrence(start, zone, { rules }).reminderSendAts, scheduleActivityTimes(start, zone, rules).reminderSendAts));
add("legacy single reminder schedule preserved", () => {
  const result = invitationScheduleForOccurrence("2026-10-28T17:00:00.000Z", zone, { invitationSendMinutesBefore: 10080, responseDueRule: "previous-midnight", reminderMinutesBeforeDue: 1440 });
  equal(result.responseDueAt, "2026-10-26T23:00:00.000Z"); equal(result.reminderSendAt, "2026-10-25T23:00:00.000Z");
});
add("new midnight distinct from legacy previous midnight", () => {
  const result = invitationScheduleForOccurrence("2026-10-28T17:00:00.000Z", zone, { invitationSendMinutesBefore: 10080, responseDueRule: "start/d", reminderMinutesBeforeDue: 1440 });
  equal(result.responseDueAt, "2026-10-27T23:00:00.000Z");
});
add("legacy invalid ordering rejected", () => throws(() => invitationScheduleForOccurrence("2026-09-30T16:00:00Z", zone, { invitationSendMinutesBefore: 1440, responseDueRule: "3d", reminderMinutesBeforeDue: 0 })));
add("legacy weekly DST test preserved", () => {
  const results = previewWeeklySeries({ startsOn: "2026-10-21", endsOn: "2026-10-28", weekdays: [3], startTime: "16:30", durationMinutes: 90, gatheringMinutesBefore: 30, timeZone: zone });
  equal(results.map(r => r.startsAt), ["2026-10-21T14:30:00.000Z", "2026-10-28T15:30:00.000Z"]);
  equal(results[0].gatheringAt, "2026-10-21T14:00:00.000Z");
});
add("legacy multi-weekday test preserved", () => equal(previewWeeklySeries({ startsOn: "2026-09-21", endsOn: "2026-09-27", weekdays: [1, 3], startTime: "18:00", durationMinutes: 60, gatheringMinutesBefore: 0, timeZone: zone }).map(r => r.date), ["2026-09-21", "2026-09-23"]));
add("series size remains bounded", () => throws(() => previewRuleWeeklySeries({ startsOn: "2026-01-01", endsOn: "2026-12-31", weekdays: [1,2,3,4,5,6,7], startTime: "18:00", timeZone: zone, rules })));
add("reject fractional weekdays", () => throws(() => previewRuleWeeklySeries({ startsOn: "2026-01-01", endsOn: "2026-01-08", weekdays: [1.5], startTime: "18:00", timeZone: zone, rules })));

