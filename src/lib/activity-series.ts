export type SeriesPreviewInput = {
  startsOn: string;
  endsOn: string;
  weekdays: number[];
  startTime: string;
  durationMinutes: number;
  gatheringMinutesBefore: number;
  timeZone: string;
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
