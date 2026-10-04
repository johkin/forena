import { durationToMinutes, evaluateTimeRule, localActivityTime, normalizeActivityTimingRules, parseActivityInstant, scheduleActivityTimes, type ActivityTimingRules, type StartTimeRule } from "./activity-time-rules";

export type SeriesPreviewInput = {
  startsOn: string;
  endsOn: string;
  weekdays: number[];
  startTime: string;
  durationMinutes: number;
  gatheringMinutesBefore: number;
  timeZone: string;
};

export type LegacyResponseDueRule = "0h" | "1h" | "2h" | "6h" | "previous-midnight" | "1d" | "2d" | "3d";

export type ResponseDueRule = LegacyResponseDueRule | StartTimeRule;

export type InvitationScheduleInput = {
  invitationSendMinutesBefore: number;
  responseDueRule: ResponseDueRule;
  reminderMinutesBeforeDue: number;
};

export type ActivityOccurrence = {
  date: string;
  gatheringAt: string | null;
  startsAt: string;
  endsAt: string;
};

function localDateTimeToUtc(date: string, time: string, timeZone: string) {
  return localActivityTime(date, time, timeZone);
}

function localDateForInstant(value: string, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function invitationScheduleForOccurrence(
  startsAt: string,
  timeZone: string,
  input: InvitationScheduleInput | { rules: ActivityTimingRules },
) {
  if ("rules" in input) {
    const schedule = scheduleActivityTimes(startsAt, timeZone, input.rules);
    return {
      invitationSendAt: schedule.invitationSendAt,
      responseDueAt: schedule.responseDueAt,
      // Legacy callers consume one reminder. New callers must persist the list.
      reminderSendAt: schedule.reminderSendAts[0] ?? null,
      reminderSendAts: schedule.reminderSendAts,
    };
  }
  if (!Number.isFinite(input.invitationSendMinutesBefore) || input.invitationSendMinutesBefore < 0) throw new Error("Ogiltig tid för kallelse");
  if (!Number.isFinite(input.reminderMinutesBeforeDue) || input.reminderMinutesBeforeDue < 0) throw new Error("Ogiltig tid för påminnelse");
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) throw new Error("Ogiltig aktivitetstid");

  const dueMinutes: Record<Exclude<LegacyResponseDueRule, "previous-midnight">, number> = {
    "0h": 0, "1h": 60, "2h": 120, "6h": 360, "1d": 1440, "2d": 2880, "3d": 4320,
  };
  if (typeof input.responseDueRule !== "string") throw new Error("Ogiltig svarsregel");
  const responseDueAt = input.responseDueRule.startsWith("start")
    ? new Date(evaluateTimeRule(input.responseDueRule, { start: startsAt, timeZone }, "start"))
    : input.responseDueRule === "previous-midnight"
    ? (() => {
        const localDate = new Date(`${localDateForInstant(startsAt, timeZone)}T00:00:00Z`);
        localDate.setUTCDate(localDate.getUTCDate() - 1);
        return localDateTimeToUtc(localDate.toISOString().slice(0, 10), "00:00", timeZone);
      })()
    : new Date(start.getTime() - dueMinutes[input.responseDueRule as Exclude<LegacyResponseDueRule, "previous-midnight">] * 60_000);

  if (Number.isNaN(responseDueAt.getTime())) throw new Error("Ogiltig svarsregel");

  const invitationSendAt = new Date(start.getTime() - input.invitationSendMinutesBefore * 60_000);
  if (invitationSendAt > responseDueAt) throw new Error("Kallelsen måste skickas innan svarstiden går ut");

  const reminderSendAt = input.reminderMinutesBeforeDue
    ? new Date(responseDueAt.getTime() - input.reminderMinutesBeforeDue * 60_000)
    : null;
  if (reminderSendAt && reminderSendAt < invitationSendAt) throw new Error("Påminnelsen hamnar före kallelsen");

  return {
    invitationSendAt: invitationSendAt.toISOString(),
    responseDueAt: responseDueAt.toISOString(),
    reminderSendAt: reminderSendAt?.toISOString() ?? null,
    reminderSendAts: reminderSendAt ? [reminderSendAt.toISOString()] : [],
  };
}

export function previewWeeklySeries(input: SeriesPreviewInput): ActivityOccurrence[] {
  const start = new Date(`${input.startsOn}T00:00:00Z`);
  const end = new Date(`${input.endsOn}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) throw new Error("Ogiltig period");
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 1440) throw new Error("Ogiltig längd");
  if (!Number.isInteger(input.gatheringMinutesBefore) || input.gatheringMinutesBefore < 0 || input.gatheringMinutesBefore > 1440) throw new Error("Ogiltig samlingstid");
  if (end.getTime() - start.getTime() > 366 * 86400000) throw new Error("En serie får omfatta högst 366 dagar");
  // Validate exact dates rather than letting Date silently normalise February 30.
  parseActivityInstant(`${input.startsOn}T00:00:00Z`);
  parseActivityInstant(`${input.endsOn}T00:00:00Z`);
  if (!Array.isArray(input.weekdays)) throw new Error("Ogiltiga veckodagar");
  const weekdays = new Set(input.weekdays);
  if (!weekdays.size || [...weekdays].some((day) => !Number.isInteger(day) || day < 1 || day > 7)) throw new Error("Välj minst en veckodag");
  new Intl.DateTimeFormat("sv-SE", { timeZone: input.timeZone }).format(start);

  const occurrences: ActivityOccurrence[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const weekday = cursor.getUTCDay() || 7;
    if (!weekdays.has(weekday)) continue;
    const date = cursor.toISOString().slice(0, 10);
    const startsAt = localDateTimeToUtc(date, input.startTime, input.timeZone);
    occurrences.push({
      date,
      gatheringAt: input.gatheringMinutesBefore ? new Date(startsAt.getTime() - input.gatheringMinutesBefore * 60_000).toISOString() : null,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + input.durationMinutes * 60_000).toISOString(),
    });
    if (occurrences.length > 100) throw new Error("En serie får innehålla högst 100 tillfällen");
  }
  if (!occurrences.length) throw new Error("Perioden innehåller inga valda veckodagar");
  return occurrences;
}

export function previewSingleActivity(input: Omit<SeriesPreviewInput, "endsOn" | "weekdays">) {
  const weekday = new Date(`${input.startsOn}T00:00:00Z`).getUTCDay() || 7;
  return previewWeeklySeries({ ...input, endsOn: input.startsOn, weekdays: [weekday] })[0];
}

export type RuleSeriesPreviewInput = Omit<SeriesPreviewInput, "durationMinutes" | "gatheringMinutesBefore"> & {
  rules: ActivityTimingRules;
};

/** Resolve every date independently; never reuse UTC offsets across DST. */
export function previewRuleWeeklySeries(input: RuleSeriesPreviewInput) {
  const rules = normalizeActivityTimingRules(input.rules);
  const occurrences = previewWeeklySeries({ ...input,
    durationMinutes: durationToMinutes(rules.duration), gatheringMinutesBefore: 0,
  });
  return occurrences.map(occurrence => ({ date: occurrence.date,
    ...scheduleActivityTimes(occurrence.startsAt, input.timeZone, rules),
  }));
}

export function previewRuleSingleActivity(input: Omit<RuleSeriesPreviewInput, "endsOn" | "weekdays">) {
  const startsAt = localActivityTime(input.startsOn, input.startTime, input.timeZone);
  return { date: input.startsOn, ...scheduleActivityTimes(startsAt, input.timeZone, input.rules) };
}
