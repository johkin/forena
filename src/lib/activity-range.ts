import { durationToMinutes, localActivityTime } from "./activity-time-rules";

/** Resolve explicit local endpoints, including offset changes across a weekend. */
export function activityRangeDuration(startDate: string, startTime: string, endDate: string, endTime: string, timeZone: string) {
  const minutes = (localActivityTime(endDate, endTime, timeZone).getTime() - localActivityTime(startDate, startTime, timeZone).getTime()) / 60000;
  if (minutes <= 0) throw new Error("Slutdatum och sluttid måste vara efter start.");
  const duration = `PT${minutes}M`;
  durationToMinutes(duration);
  return duration;
}

export function activityDateKey(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

/** Index only the displayed month; midnight ends belong to the preceding day. */
export function activitiesByDate<T extends { startsAt: string; endsAt: string }>(activities: T[], timeZone: string, year: number, month: number) {
  const map = new Map<string, T[]>();
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (const activity of activities) {
    const first = activityDateKey(activity.startsAt, timeZone);
    const last = activityDateKey(new Date(new Date(activity.endsAt).getTime() - 1).toISOString(), timeZone);
    for (let day = 1; day <= count; day++) {
      const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (key >= first && key <= last) map.set(key, [...(map.get(key) ?? []), activity]);
    }
  }
  return map;
}
