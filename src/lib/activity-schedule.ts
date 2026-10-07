import { invitationScheduleForOccurrence, type ResponseDueRule } from "./activity-series";
import { normalizeActivityTimingRules, scheduleActivityTimes } from "./activity-time-rules";
export type ScheduleRequest = { timingRules?: unknown; invitationSendMinutesBefore?: number; responseDueRule?: ResponseDueRule; reminderMinutesBeforeDue?: number; reminderMinutesBeforeDueList?: number[] };
export function buildInvitationSchedule(startsAt: string, timeZone: string, body: ScheduleRequest) {
  if (body.timingRules !== undefined) {
    const result = scheduleActivityTimes(startsAt, timeZone, normalizeActivityTimingRules(body.timingRules));
    return { invitationSendAt: result.invitationSendAt, responseDueAt: result.responseDueAt, reminderSendAt: null, reminderSendAts: result.reminderSendAts };
  }
  const offsets = body.reminderMinutesBeforeDueList ?? (body.reminderMinutesBeforeDue ? [body.reminderMinutesBeforeDue] : []);
  if (!Array.isArray(offsets) || offsets.length > 5 || offsets.some(n => !Number.isSafeInteger(n) || n <= 0 || n > 366 * 1440) || new Set(offsets).size !== offsets.length) throw new Error("Ogiltiga påminnelser.");
  const result = invitationScheduleForOccurrence(startsAt, timeZone, { invitationSendMinutesBefore: body.invitationSendMinutesBefore ?? 10080, responseDueRule: body.responseDueRule ?? "6h", reminderMinutesBeforeDue: 0 });
  const reminders = offsets.map(n => new Date(Date.parse(result.responseDueAt) - n * 60000).toISOString()).sort();
  if (Date.parse(result.invitationSendAt) >= Date.parse(result.responseDueAt) || reminders.some(r => r <= result.invitationSendAt || r >= result.responseDueAt)) throw new Error("Påminnelser ska ligga mellan kallelse och sista svarstid.");
  return { ...result, reminderSendAt: null, reminderSendAts: reminders };
}
export function requireFutureSchedule(schedule: ReturnType<typeof buildInvitationSchedule>, now = Date.now()) {
  if (Date.parse(schedule.invitationSendAt) <= now) throw new Error("Kallelsetiden har passerat. Välj Skicka nu eller en framtida tid.");
}

/** Elapsed send times become due immediately; elapsed reminders are skipped. */
export function prepareInvitationSchedule<T extends ReturnType<typeof buildInvitationSchedule>>(schedule: T, now = Date.now()) {
  const send = Date.parse(schedule.invitationSendAt);
  const due = Date.parse(schedule.responseDueAt);
  if (!Number.isFinite(send) || !Number.isFinite(due) || !Number.isFinite(now) || due <= now || send >= due) {
    throw new Error("Sista svarstid har passerat eller kallelseschemat är ogiltigt. Välj en framtida svarstid.");
  }
  const sendImmediately = send <= now;
  const invitationSendAt = sendImmediately ? new Date(now).toISOString() : schedule.invitationSendAt;
  const reminders = schedule.reminderSendAts.filter(time => Date.parse(time) > Math.max(now, send));
  return { ...schedule, invitationSendAt, sendImmediately, reminderSendAts: reminders,
    reminderSendAt: schedule.reminderSendAt && reminders.includes(schedule.reminderSendAt) ? schedule.reminderSendAt : null };
}
