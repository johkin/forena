const STOCKHOLM_TIME_ZONE = "Europe/Stockholm";

// Both maps are bounded because time zones may originate in request bodies.
const CACHE_LIMIT = 128;
const formatters = new Map<string, Intl.DateTimeFormat>();
const timeZones = new Map<string, string>();

function cached<T>(cache: Map<string, T>, key: string, create: () => T): T {
  const value = cache.get(key) ?? create();
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_LIMIT) {
    cache.delete(cache.keys().next().value!);
  }
  return value;
}

export function getFormatter(timeZone: string, options: Intl.DateTimeFormatOptions) {
  const zone = options.timeZone ?? timeZone;
  const canonicalZone = cached(timeZones, zone.toLowerCase(), () =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: zone }).resolvedOptions().timeZone);
  const effectiveOptions = { ...options, timeZone: canonicalZone };
  const key = JSON.stringify(Object.entries(effectiveOptions).sort(([a], [b]) => a.localeCompare(b)));
  return cached(formatters, key, () => new Intl.DateTimeFormat("sv-SE", effectiveOptions));
}

export function formatDateTimeInZone(value: string | Date | null, timeZone: string) {
  if (!value) return null;
  const formatter = getFormatter(timeZone, {
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
  const formatter = getFormatter(STOCKHOLM_TIME_ZONE, {
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
