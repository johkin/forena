import { describe, expect, it } from "vitest";
import { formatStockholmDateTime, stockholmDateInDays } from "./date-time";

describe("formatStockholmDateTime", () => {
  it("converts UTC to Swedish summer time", () => {
    expect(formatStockholmDateTime("2026-09-23T11:58:00Z")).toBe("onsdag 23 september 2026 kl. 13:58");
  });

  it("converts UTC to Swedish standard time", () => {
    expect(formatStockholmDateTime("2026-12-08T16:30:00Z")).toBe("tisdag 8 december 2026 kl. 17:30");
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
