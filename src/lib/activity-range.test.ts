import { expect, it } from "vitest";
import { activitiesByDate, activityRangeDuration } from "./activity-range";
import { createDutyIntervals, validateDutyBounds } from "./activity-duty-schedule";
import { previewRuleSingleActivity } from "./activity-series";
import { FALLBACK_ACTIVITY_DEFAULTS } from "./activity-defaults";
const zone = "Europe/Stockholm";
it("creates an 08–18 activity and five assignable two-hour shifts", () => {
 const duration = activityRangeDuration("2026-10-13", "08:00", "2026-10-13", "18:00", zone);
 const activity = previewRuleSingleActivity({ startsOn:"2026-10-13", startTime:"08:00", timeZone:zone, rules:{ ...FALLBACK_ACTIVITY_DEFAULTS, reminderRules:[], duration } });
 const duties = createDutyIntervals("2026-10-13","08:00","18:00",zone,120,3);
 expect(duties).toHaveLength(5);
 expect(() => validateDutyBounds(duties,activity.startsAt,activity.endsAt)).not.toThrow();
 expect(() => validateDutyBounds(duties,activity.startsAt,"2026-10-13T08:00:00Z")).toThrow("rymma");
});
it("resolves a Friday–Sunday cup across the autumn clock change", () => {
 const duration=activityRangeDuration("2026-10-23","18:00","2026-10-25","18:00",zone);
 expect(duration).toBe("PT2940M");
 const activity=previewRuleSingleActivity({startsOn:"2026-10-23",startTime:"18:00",timeZone:zone,rules:{...FALLBACK_ACTIVITY_DEFAULTS,reminderRules:[],duration}});
 expect(activity.endsAt).toBe("2026-10-25T17:00:00.000Z");
 expect([...activitiesByDate([activity],zone,2026,10).keys()]).toEqual(["2026-10-23","2026-10-24","2026-10-25"]);
});
it("bounds month indexing and excludes an exclusive midnight end", () => {
 const activity={startsAt:"2026-10-30T17:00:00Z",endsAt:"2026-11-02T23:00:00Z"};
 expect([...activitiesByDate([activity],zone,2026,11).keys()]).toEqual(["2026-11-01","2026-11-02"]);
});
it("supports shifts over midnight", () => {
 const shifts=createDutyIntervals("2026-10-13","22:00","02:00",zone,120,1,"","","","2026-10-14");
 expect(shifts).toHaveLength(2);
 expect(shifts[1].endsAt).toBe("2026-10-14T00:00:00.000Z");
});
it("rejects backwards dates, nonexistent times and excessive duration", () => {
 expect(()=>activityRangeDuration("2026-10-13","18:00","2026-10-13","08:00",zone)).toThrow();
 expect(()=>activityRangeDuration("2026-03-29","01:00","2026-03-29","02:30",zone)).toThrow();
 expect(()=>activityRangeDuration("2026-10-13","08:00","2026-10-21","08:00",zone)).toThrow();
});
