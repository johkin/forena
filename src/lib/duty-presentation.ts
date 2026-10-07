import type { Duty } from "./activity-duty-schedule";

type Timing = Pick<Duty, "startsAt" | "endsAt" | "dueAt">;

export function dutyDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function dutyDateLabel(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

/** Omit the date only when a surrounding date heading supplies the same local day. */
export function formatDutyTiming(duty: Timing, timeZone: string, contextDate?: string) {
  const time = (value: string) => new Intl.DateTimeFormat("sv-SE", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
  const date = (value: string) => new Intl.DateTimeFormat("sv-SE", { timeZone, day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  if (duty.startsAt && duty.endsAt) {
    const startDay = dutyDate(duty.startsAt, timeZone);
    if (startDay === dutyDate(duty.endsAt, timeZone)) {
      return `${startDay === contextDate ? "" : `${date(duty.startsAt)} `}${time(duty.startsAt)}–${time(duty.endsAt)}`;
    }
    return `${date(duty.startsAt)} ${time(duty.startsAt)}–${date(duty.endsAt)} ${time(duty.endsAt)}`;
  }
  if (duty.dueAt) {
    return `Lämnas senast ${dutyDate(duty.dueAt, timeZone) === contextDate ? "" : `${date(duty.dueAt)} `}${time(duty.dueAt)}`;
  }
  return "Ingen särskild tid";
}
