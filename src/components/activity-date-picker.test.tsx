import { expect, it } from "vitest";
import { weekDates, shiftCalendarDate } from "./activity-date-picker";
import { stepActivityTime } from "./activity-time-stepper";
it("shows Monday through Sunday across month and year boundaries", () => {
 expect(weekDates("2027-01-01")).toEqual(["2026-12-28","2026-12-29","2026-12-30","2026-12-31","2027-01-01","2027-01-02","2027-01-03"]);
 expect(weekDates("2028-02-29")[1]).toBe("2028-02-29");
});
it("moves calendar selection across month and year boundaries", () => {
 expect(shiftCalendarDate("2028-02-28",1)).toBe("2028-02-29");
 expect(shiftCalendarDate("2028-02-29",1)).toBe("2028-03-01");
 expect(shiftCalendarDate("2026-12-31",1)).toBe("2027-01-01");
 expect(shiftCalendarDate("2027-01-01",-7)).toBe("2026-12-25");
});
it("steps fifteen minutes while preserving exact minutes", () => {
 expect(stepActivityTime("18:02",1)).toBe("18:17");
 expect(stepActivityTime("18:02",-1)).toBe("17:47");
 expect(stepActivityTime("23:45",1)).toBe("00:00");
 expect(stepActivityTime("00:00",-1)).toBe("23:45");
});
