export type SeriesPreviewInput = {
  startsOn: string;
  endsOn: string;
  weekdays: number[];
  startTime: string;
  durationMinutes: number;
  gatheringMinutesBefore: number;
  timeZone: string;
};

export type ResponseDueRule = "0h" | "1h" | "2h" | "6h" | "previous-midnight" | "1d" | "2d" | "3d";

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
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) throw new Error("Ogiltigt datum eller klockslag");
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let result = desired;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(result)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    result += desired - represented;
  }
  return new Date(result);
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
  input: InvitationScheduleInput,
) {
  if (!Number.isFinite(input.invitationSendMinutesBefore) || input.invitationSendMinutesBefore < 0) throw new Error("Ogiltig tid för kallelse");
  if (!Number.isFinite(input.reminderMinutesBeforeDue) || input.reminderMinutesBeforeDue < 0) throw new Error("Ogiltig tid för påminnelse");
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) throw new Error("Ogiltig aktivitetstid");

  const dueMinutes: Record<Exclude<ResponseDueRule, "previous-midnight">, number> = {
    "0h": 0, "1h": 60, "2h": 120, "6h": 360, "1d": 1440, "2d": 2880, "3d": 4320,
  };
  const responseDueAt = input.responseDueRule === "previous-midnight"
    ? (() => {
        const localDate = new Date(`${localDateForInstant(startsAt, timeZone)}T00:00:00Z`);
        localDate.setUTCDate(localDate.getUTCDate() - 1);
        return localDateTimeToUtc(localDate.toISOString().slice(0, 10), "00:00", timeZone);
      })()
    : new Date(start.getTime() - dueMinutes[input.responseDueRule] * 60_000);

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
  };
}

export function previewWeeklySeries(input: SeriesPreviewInput): ActivityOccurrence[] {
  const start = new Date(`${input.startsOn}T00:00:00Z`);
  const end = new Date(`${input.endsOn}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) throw new Error("Ogiltig period");
  if (input.durationMinutes < 1 || input.durationMinutes > 1440) throw new Error("Ogiltig längd");
  if (input.gatheringMinutesBefore < 0 || input.gatheringMinutesBefore > 1440) throw new Error("Ogiltig samlingstid");
  const weekdays = new Set(input.weekdays);
  if (!weekdays.size || [...weekdays].some((day) => day < 1 || day > 7)) throw new Error("Välj minst en veckodag");
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
