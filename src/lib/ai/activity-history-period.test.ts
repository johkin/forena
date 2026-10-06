import { expect, it } from "vitest";
import { historyPeriodFromQuestion, recentHistoryPeriod } from "./activity-history-period";

it("resolves three weeks including today using the organization date", () => {
  expect(historyPeriodFromQuestion("Hur många har registrerad träning de senaste tre veckorna?", "2026-10-06"))
    .toEqual({ from: "2026-09-16", through: "2026-10-06" });
});
it("handles numeric periods, year boundaries and leap days", () => {
  expect(historyPeriodFromQuestion("senaste 2 dagarna", "2026-01-01")).toEqual({ from: "2025-12-31", through: "2026-01-01" });
  expect(recentHistoryPeriod("2024-03-01", 3).from).toBe("2024-02-28");
  expect(historyPeriodFromQuestion("senaste 3 veckorna", "2026-03-30")?.from).toBe("2026-03-10");
});
it("supports singular Swedish periods", () => {
  expect(historyPeriodFromQuestion("senaste veckan", "2026-10-06")?.from).toBe("2026-09-30");
  expect(historyPeriodFromQuestion("senaste dagen", "2026-10-06")?.from).toBe("2026-10-06");
});
it("leaves unspecified and oversized periods unresolved", () => {
  expect(historyPeriodFromQuestion("Vilka tränade?", "2026-10-06")).toBeUndefined();
  expect(historyPeriodFromQuestion("senaste 100 veckorna", "2026-10-06")).toBeUndefined();
  expect(() => recentHistoryPeriod("2026-10-06", 0)).toThrow();
});
