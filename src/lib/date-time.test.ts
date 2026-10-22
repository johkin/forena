import { describe, expect, it } from "vitest";
import { formatDateTimeInZone, formatStockholmDateTime, getFormatter, stockholmDateInDays } from "./date-time";

describe("formatter cache", () => {
  it("shares formatters across time-zone casing, aliases and option ordering", () => {
    const formatter = getFormatter("UTC", { year:"numeric", month:"long" });
    expect(getFormatter("utc", { month:"long", year:"numeric" })).toBe(formatter);
    expect(getFormatter("Etc/UTC", { year:"numeric", month:"long" })).toBe(formatter);
  });

  it("keeps different formatting options and effective time zones separate", () => {
    const date = new Date("2026-09-23T23:30:00Z");
    const year = getFormatter("UTC", { year:"numeric" });
    const month = getFormatter("UTC", { month:"long" });
    expect(year.format(date)).toBe("2026");
    expect(month.format(date)).toBe("september");
    expect(month).not.toBe(year);
    expect(getFormatter("UTC", { timeZone:"Europe/Stockholm", day:"numeric" }).format(date)).toBe("24");
  });

  it("evicts older entries while retaining recently reused formatters", () => {
    const evicted = getFormatter("UTC", { dateStyle:"full" });
    const reused = getFormatter("UTC", { timeStyle:"short" });
    for (const timeZone of Intl.supportedValuesOf("timeZone").slice(0, 140)) {
      getFormatter(timeZone, { dateStyle:"full" });
      expect(getFormatter("UTC", { timeStyle:"short" })).toBe(reused);
    }
    expect(getFormatter("UTC", { dateStyle:"full" })).not.toBe(evicted);
    expect(() => getFormatter("Invalid/Zone", {})).toThrow(RangeError);
  });
});

describe("formatStockholmDateTime", () => {
  it("converts UTC to Swedish summer time", () => {
    expect(formatStockholmDateTime("2026-09-23T11:58:00Z")).toBe("onsdag 23 september 2026 kl. 13:58");
  });

  it("converts UTC to Swedish standard time", () => {
    expect(formatStockholmDateTime("2026-12-08T16:30:00Z")).toBe("tisdag 8 december 2026 kl. 17:30");
  });

  it("can represent the same instant in the viewer's time zone", () => {
    expect(formatDateTimeInZone("2026-09-23T14:30:00Z", "Asia/Bangkok")).toBe("onsdag 23 september 2026 kl. 21:30");
  });
});

describe("stockholmDateInDays", () => {
  it("uses Swedish summer time", () => {
    expect(stockholmDateInDays(7, 17, 30, new Date("2026-09-22T12:00:00Z")).toISOString()).toBe("2026-09-29T15:30:00.000Z");
  });

  it("uses Swedish standard time", () => {
    expect(stockholmDateInDays(7, 17, 30, new Date("2026-12-01T12:00:00Z")).toISOString()).toBe("2026-12-08T16:30:00.000Z");
  });
});
