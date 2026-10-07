import { expect, it } from "vitest";
import { dutyDate, formatDutyTiming } from "./duty-presentation";
const zone = "Europe/Stockholm";
const interval = { startsAt: "2026-10-11T06:00:00Z", endsAt: "2026-10-11T08:00:00Z", dueAt: null };
it("uses only local times under the matching date heading", () => {
  expect(formatDutyTiming(interval, zone, "2026-10-11")).toBe("08:00–10:00");
  expect(formatDutyTiming(interval, zone)).toBe("11 okt. 2026 08:00–10:00");
  expect(formatDutyTiming(interval, zone, "2026-10-12")).toBe("11 okt. 2026 08:00–10:00");
});
it("retains both dates across local midnight, including a year boundary", () => {
  const timing = { ...interval, startsAt: "2026-12-31T22:00:00Z", endsAt: "2027-01-01T00:00:00Z" };
  expect(formatDutyTiming(timing, zone, "2026-12-31")).toBe("31 dec. 2026 23:00–1 jan. 2027 01:00");
});
it("compares local dates instead of UTC dates", () => {
  const timing = { ...interval, startsAt: "2026-10-10T22:00:00Z", endsAt: "2026-10-11T01:00:00Z" };
  expect(dutyDate(timing.startsAt, zone)).toBe("2026-10-11");
  expect(formatDutyTiming(timing, zone, "2026-10-11")).toBe("00:00–03:00");
});
it("formats deadlines and untimed duties", () => {
  const timing = { startsAt: null, endsAt: null, dueAt: "2026-10-11T06:30:00Z" };
  expect(formatDutyTiming(timing, zone, "2026-10-11")).toBe("Lämnas senast 08:30");
  expect(formatDutyTiming(timing, zone)).toBe("Lämnas senast 11 okt. 2026 08:30");
  expect(formatDutyTiming({ ...timing, dueAt: null }, zone)).toBe("Ingen särskild tid");
});
it("uses the configured timezone and its winter offset", () => {
  expect(formatDutyTiming({ ...interval, startsAt: "2026-10-26T07:00:00Z", endsAt: "2026-10-26T09:00:00Z" }, zone, "2026-10-26")).toBe("08:00–10:00");
  expect(formatDutyTiming(interval, "UTC", "2026-10-11")).toBe("06:00–08:00");
});
