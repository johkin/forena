import { describe, expect, it } from "vitest";
import { stockholmDateInDays } from "./date-time";

describe("stockholmDateInDays", () => {
  it("uses Swedish summer time", () => {
    expect(stockholmDateInDays(7, 17, 30, new Date("2026-09-22T12:00:00Z")).toISOString()).toBe("2026-09-29T15:30:00.000Z");
  });

  it("uses Swedish standard time", () => {
    expect(stockholmDateInDays(7, 17, 30, new Date("2026-12-01T12:00:00Z")).toISOString()).toBe("2026-12-08T16:30:00.000Z");
  });
});
