const STOCKHOLM_TIME_ZONE = "Europe/Stockholm";

// ⚡ Bolt: Cache Intl.DateTimeFormat instances.
// Creating these is expensive (~1-2ms each), so caching them prevents main-thread blocking
// during frequent renders (e.g., in team-overview and team-status-card).
const formatters = new Map<string, Intl.DateTimeFormat>();
export function getFormatter(timeZone: string, optionsKey: string, options: Intl.DateTimeFormatOptions) {
  const key = `${timeZone}:${optionsKey}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("sv-SE", { timeZone, ...options });
    formatters.set(key, formatter);
  }
  return formatter;
}

export function formatDateTimeInZone(value: string | Date | null, timeZone: string) {
  if (!value) return null;
  const formatter = getFormatter(timeZone, "default-datetime", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return formatter.format(typeof value === "string" ? new Date(value) : value);
}

export function formatStockholmDateTime(value: string | Date | null) {
  return formatDateTimeInZone(value, STOCKHOLM_TIME_ZONE);
}

function partsInStockholm(value: Date) {
  const formatter = getFormatter(STOCKHOLM_TIME_ZONE, "stockholm-parts", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function stockholmDateInDays(daysAhead: number, hour: number, minute: number, now = new Date()) {
  const targetDay = new Date(now.getTime() + daysAhead * 86_400_000);
  const day = partsInStockholm(targetDay);
  const localAsUtc = Date.UTC(Number(day.year), Number(day.month) - 1, Number(day.day), hour, minute);
  const offsetParts = partsInStockholm(new Date(localAsUtc));
  const representedAsUtc = Date.UTC(
    Number(offsetParts.year),
    Number(offsetParts.month) - 1,
    Number(offsetParts.day),
    Number(offsetParts.hour),
    Number(offsetParts.minute),
    Number(offsetParts.second),
  );
  return new Date(localAsUtc - (representedAsUtc - localAsUtc));
}
