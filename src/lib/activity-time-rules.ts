/**
 * Bounded date math for activity planning. Never evaluates JavaScript.
 * Calendar days (/d and -Nd) use the organisation's IANA time zone;
 * hours/minutes are elapsed time. No dependency on the machine time zone.
 */
export const ACTIVITY_TIME_RULE_VERSION = 1 as const;
export type RuleAnchor = "start" | "deadline";
export type StartTimeRule = `start${string}`;
export type DeadlineTimeRule = `deadline${string}`;
export type ActivityTimingRules = {
  duration: string;
  gatheringRule: StartTimeRule;
  invitationRule: StartTimeRule;
  responseDueRule: StartTimeRule;
  reminderRules: DeadlineTimeRule[];
};
export type ParsedTimeRule = {
  anchor: RuleAnchor;
  offsets: ReadonlyArray<{ amount: number; unit: "d" | "h" | "m" }>;
  startOfDay: boolean;
};
export class ActivityTimingError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ActivityTimingError";
  }
}
export const MAX_ACTIVITY_DURATION_MINUTES = 7 * 24 * 60;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MAX_OFFSET_MINUTES = 366 * 24 * 60;
const MAX_REMINDERS = 5;
const cache = new Map<string, Intl.DateTimeFormat>();
type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number; millisecond: number };

function fail(code: string, message: string): never { throw new ActivityTimingError(code, message); }
function formatter(timeZone: string): Intl.DateTimeFormat {
  if (typeof timeZone !== "string" || !timeZone || timeZone.length > 80) fail("time-zone", "Ogiltig tidszon.");
  const existing = cache.get(timeZone);
  if (existing) return existing;
  try {
    const result = new Intl.DateTimeFormat("en-CA-u-ca-iso8601-nu-latn", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
    if (cache.size >= 32) cache.delete(cache.keys().next().value!);
    cache.set(timeZone, result);
    return result;
  } catch { return fail("time-zone", "Ogiltig IANA-tidszon."); }
}
function localParts(ms: number, timeZone: string): LocalParts {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(new Date(ms)).map(p => [p.type, p.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
    millisecond: ((ms % 1000) + 1000) % 1000,
  };
}
function wallTime(parts: LocalParts): number {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, parts.millisecond);
  return date.getTime();
}
function utcParts(ms: number): LocalParts {
  const date = new Date(ms);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
    hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: date.getUTCSeconds(), millisecond: date.getUTCMilliseconds() };
}
function checkedParts(parts: LocalParts): number {
  const ms = wallTime(parts);
  const roundTrip = utcParts(ms);
  if (parts.year < 1900 || parts.year > 9999 || Object.keys(parts).some(key => parts[key as keyof LocalParts] !== roundTrip[key as keyof LocalParts])) {
    fail("local-time", "Ogiltigt datum eller klockslag.");
  }
  return ms;
}
/** Explicit offsets are mandatory: a server's local time must never leak in. */
export function parseActivityInstant(value: string | Date): number {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime()) || value.getUTCFullYear() < 1900 || value.getUTCFullYear() > 9999) fail("instant", "Ogiltig tidpunkt.");
    return value.getTime();
  }
  if (typeof value !== "string") fail("instant", "Tidpunkten ska ha en explicit UTC-offset.");
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) fail("instant", "Tidpunkten ska ha en explicit UTC-offset.");
  const [, year, month, day, hour, minute, second = "0", fraction = "0", offset] = match;
  checkedParts({ year: +year, month: +month, day: +day, hour: +hour, minute: +minute, second: +second, millisecond: +fraction.padEnd(3, "0") });
  if (offset !== "Z" && (+offset.slice(1, 3) > 23 || +offset.slice(4) > 59)) fail("instant", "Ogiltig UTC-offset.");
  const result = Date.parse(value);
  if (!Number.isFinite(result)) fail("instant", "Ogiltig tidpunkt.");
  return result;
}
/**
 * Resolve a local wall clock using Intl's time-zone database. Collect nearby
 * offsets, then verify candidates by round-trip instead of iteratively guessing.
 * Repeated times choose the earlier instant; gaps move forward by the gap.
 * Direct form input can select reject mode to avoid silently changing a time.
 */
function fromLocal(parts: LocalParts, timeZone: string, rejectGap = false): number {
  const wanted = checkedParts(parts);
  const offsets = new Set<number>();
  for (let hours = -72; hours <= 72; hours += 6) {
    const sample = wanted + hours * HOUR;
    offsets.add(wallTime(localParts(sample, timeZone)) - sample);
  }
  const candidates = [...offsets].map(offset => wanted - offset);
  const exact = candidates.filter(ms => wallTime(localParts(ms, timeZone)) === wanted).sort((a, b) => a - b);
  if (exact.length) return exact[0];
  if (rejectGap) fail("nonexistent-local-time", "Klockslaget finns inte i denna tidszon vid tidsomst\u00e4llningen. V\u00e4lj en annan tid.");
  const after = candidates.map(ms => ({ ms, delta: wallTime(localParts(ms, timeZone)) - wanted }))
    .filter(item => item.delta > 0 && item.delta <= DAY).sort((a, b) => a.delta - b.delta || a.ms - b.ms);
  if (!after.length) fail("local-time", "Det lokala klockslaget kunde inte ber\u00e4knas.");
  return after[0].ms;
}
export function localActivityTime(date: string, time: string, timeZone: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) fail("local-time", "Ogiltigt datum eller klockslag.");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(fromLocal({ year, month, day, hour, minute, second: 0, millisecond: 0 }, timeZone, true));
}
export function parseTimeRule(value: unknown, expectedAnchor?: RuleAnchor): ParsedTimeRule {
  if (typeof value !== "string" || value.length > 80) fail("rule", "Ogiltig tidsregel.");
  const match = /^(start|deadline)((?:-\d{1,6}[dhm]){0,4})(\/d)?$/.exec(value);
  if (!match) fail("rule", "Anv\u00e4nd start eller deadline, avdrag med d/h/m och valfritt /d sist.");
  const anchor = match[1] as RuleAnchor;
  if (expectedAnchor && anchor !== expectedAnchor) fail("anchor", `Regeln ska utg\u00e5 fr\u00e5n ${expectedAnchor}.`);
  const offsets = [...match[2].matchAll(/-(\d+)([dhm])/g)].map(item => ({ amount: +item[1], unit: item[2] as "d" | "h" | "m" }));
  const nominalMinutes = offsets.reduce((total, part) => total + part.amount * (part.unit === "d" ? 1440 : part.unit === "h" ? 60 : 1), 0);
  if (nominalMinutes > MAX_OFFSET_MINUTES) fail("range", "Tidsregeln f\u00e5r avse h\u00f6gst 366 dagar.");
  return { anchor, offsets, startOfDay: Boolean(match[3]) };
}
export function evaluateTimeRule(value: string, context: { start: string | Date; deadline?: string | Date; timeZone: string }, expectedAnchor?: RuleAnchor): string {
  const rule = parseTimeRule(value, expectedAnchor);
  formatter(context.timeZone);
  const anchor = rule.anchor === "start" ? context.start : context.deadline;
  if (anchor === undefined) fail("deadline-missing", "Sista svarstid saknas.");
  let instant = parseActivityInstant(anchor);
  for (const { amount, unit } of rule.offsets) {
    if (amount === 0) continue;
    if (unit !== "d") { instant -= amount * (unit === "h" ? HOUR : MINUTE); continue; }
    const parts = localParts(instant, context.timeZone);
    const shifted = utcParts(wallTime(parts) - amount * DAY);
    instant = fromLocal(shifted, context.timeZone);
  }
  if (rule.startOfDay) {
    const parts = localParts(instant, context.timeZone);
    instant = fromLocal({ ...parts, hour: 0, minute: 0, second: 0, millisecond: 0 }, context.timeZone);
  }
  return new Date(parseActivityInstant(new Date(instant))).toISOString();
}
/** ISO duration for actual activity length: positive integer hours/minutes. */
export function durationToMinutes(value: unknown): number {
  if (typeof value !== "string" || value.length > 24) fail("duration", "Ogiltig aktivitetsl\u00e4ngd.");
  const match = /^PT(?:(\d{1,4})H)?(?:(\d{1,5})M)?$/.exec(value);
  if (!match || (!match[1] && !match[2])) fail("duration", "Ange l\u00e4ngd som PT1H30M eller PT90M.");
  const minutes = +(match[1] ?? 0) * 60 + +(match[2] ?? 0);
  if (minutes < 1 || minutes > MAX_ACTIVITY_DURATION_MINUTES) fail("duration", "Aktivitetsl\u00e4ngden ska vara 1 minut till 7 dygn.");
  return minutes;
}
export function normalizeActivityTimingRules(value: unknown): ActivityTimingRules {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("rules", "Tidsregler saknas.");
  const input = value as Record<string, unknown>;
  const fields = ["duration", "gatheringRule", "invitationRule", "responseDueRule", "reminderRules"];
  if (Object.keys(input).some(key => !fields.includes(key))) fail("rules", "Ok\u00e4nt f\u00e4lt i tidsreglerna.");
  const duration = `PT${durationToMinutes(input.duration)}M`;
  for (const key of ["gatheringRule", "invitationRule", "responseDueRule"]) parseTimeRule(input[key], "start");
  if (!Array.isArray(input.reminderRules) || input.reminderRules.length > MAX_REMINDERS) fail("reminders", "Ange h\u00f6gst fem p\u00e5minnelser.");
  const reminderRules = input.reminderRules.map(rule => { parseTimeRule(rule, "deadline"); return rule as DeadlineTimeRule; });
  if (new Set(reminderRules).size !== reminderRules.length) fail("reminders", "P\u00e5minnelserna inneh\u00e5ller dubbletter.");
  return { duration, gatheringRule: input.gatheringRule as StartTimeRule,
    invitationRule: input.invitationRule as StartTimeRule, responseDueRule: input.responseDueRule as StartTimeRule, reminderRules };
}
export function scheduleActivityTimes(start: string | Date, timeZone: string, value: unknown) {
  const rules = normalizeActivityTimingRules(value);
  const startsAt = new Date(parseActivityInstant(start)).toISOString();
  const context = { start: startsAt, timeZone };
  const gathering = evaluateTimeRule(rules.gatheringRule, context, "start");
  const invitationSendAt = evaluateTimeRule(rules.invitationRule, context, "start");
  const responseDueAt = evaluateTimeRule(rules.responseDueRule, context, "start");
  if (parseActivityInstant(gathering) > parseActivityInstant(startsAt) || parseActivityInstant(responseDueAt) > parseActivityInstant(startsAt)) fail("ordering", "Samling och svarstid f\u00e5r inte ligga efter start.");
  if (parseActivityInstant(invitationSendAt) >= parseActivityInstant(responseDueAt)) fail("ordering", "Kallelsen m\u00e5ste skickas f\u00f6re sista svarstid.");
  const reminderSendAts = rules.reminderRules.map(rule => evaluateTimeRule(rule, { ...context, deadline: responseDueAt }, "deadline"))
    .sort((a, b) => parseActivityInstant(a) - parseActivityInstant(b));
  if (new Set(reminderSendAts).size !== reminderSendAts.length) fail("reminders", "Flera p\u00e5minnelser hamnar samtidigt.");
  if (reminderSendAts.some(time => parseActivityInstant(time) <= parseActivityInstant(invitationSendAt) || parseActivityInstant(time) >= parseActivityInstant(responseDueAt))) {
    fail("ordering", "P\u00e5minnelser ska ligga efter kallelsen och f\u00f6re sista svarstid.");
  }
  const endsAt = new Date(parseActivityInstant(start) + durationToMinutes(rules.duration) * MINUTE).toISOString();
  return { rules, startsAt, endsAt, gatheringAt: gathering === startsAt ? null : gathering,
    invitationSendAt, responseDueAt, reminderSendAts };
}
/** Inspection only. This function never silently changes or queues a send. */
export function inspectScheduleAgainstNow(schedule: ReturnType<typeof scheduleActivityTimes>, now: string | Date) {
  const ms = parseActivityInstant(now);
  return {
    invitationInPast: parseActivityInstant(schedule.invitationSendAt) <= ms,
    deadlinePassed: parseActivityInstant(schedule.responseDueAt) <= ms,
    passedReminderTimes: schedule.reminderSendAts.filter(value => parseActivityInstant(value) <= ms),
  };
}

