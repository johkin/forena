import { describe, expect, it } from "vitest";
import { previewWeeklySeries } from "./activity-series";

describe("previewWeeklySeries", () => {
  it("keeps local time when Sweden changes from summer time", () => {
    const result = previewWeeklySeries({ startsOn: "2026-10-21", endsOn: "2026-10-28", weekdays: [3], startTime: "16:30", durationMinutes: 90, gatheringMinutesBefore: 30, timeZone: "Europe/Stockholm" });
    expect(result.map((item) => item.startsAt)).toEqual(["2026-10-21T14:30:00.000Z", "2026-10-28T15:30:00.000Z"]);
    expect(result[0].gatheringAt).toBe("2026-10-21T14:00:00.000Z");
  });

  it("supports several weekdays", () => {
    const result = previewWeeklySeries({ startsOn: "2026-09-21", endsOn: "2026-09-27", weekdays: [1, 3], startTime: "18:00", durationMinutes: 60, gatheringMinutesBefore: 0, timeZone: "Europe/Stockholm" });
    expect(result.map((item) => item.date)).toEqual(["2026-09-21", "2026-09-23"]);
  });
});
