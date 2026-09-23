const STOCKHOLM_TIME_ZONE = "Europe/Stockholm";

export function formatDateTimeInZone(value: string | Date | null, timeZone: string) {
  if (!value) return null;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatStockholmDateTime(value: string | Date | null) {
  return formatDateTimeInZone(value, STOCKHOLM_TIME_ZONE);
}

function partsInStockholm(value: Date) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: STOCKHOLM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
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
