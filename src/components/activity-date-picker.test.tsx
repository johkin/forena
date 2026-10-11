import { expect, it } from "vitest";
import { monthCells, shiftCalendarDate } from "./activity-date-picker";
import { stepActivityTime } from "./activity-time-stepper";
it("uses Monday-first rows and includes leap day", () => {
 const cells = monthCells("2028-02");
 expect(cells[0]).toBe(null); expect(cells[1]).toBe("2028-02-01");
 expect(cells.filter(Boolean)).toHaveLength(29); expect(cells.length % 7).toBe(0);
});
it("moves calendar selection across month and year boundaries", () => {
 expect(shiftCalendarDate("2028-02-28",1)).toBe("2028-02-29");
 expect(shiftCalendarDate("2028-02-29",1)).toBe("2028-03-01");
 expect(shiftCalendarDate("2026-12-31",1)).toBe("2027-01-01");
 expect(shiftCalendarDate("2027-01-01",-7)).toBe("2026-12-25");
});
it("steps to the next five-minute value without losing legacy minutes", () => {
 expect(stepActivityTime("18:02",1)).toBe("18:05");
 expect(stepActivityTime("18:02",-1)).toBe("18:00");
 expect(stepActivityTime("23:55",1)).toBe("00:00");
 expect(stepActivityTime("00:00",-1)).toBe("23:55");
});
