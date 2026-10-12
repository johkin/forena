import {expect,it} from "vitest";
import {monthDates,selectRangeDate} from "./activity-range-calendar";
it("pads Monday-first months and retains leap day",()=>{
 const days=monthDates("2028-02");expect(days[0]).toBe(null);expect(days[1]).toBe("2028-02-01");expect(days.filter(Boolean)).toHaveLength(29);expect(days.length%7).toBe(0);
});
it("keeps endpoints ordered when selecting either boundary",()=>{
 expect(selectRangeDate("2030-10-16","2030-10-18","2030-10-20","start")).toEqual({start:"2030-10-20",end:"2030-10-20"});
 expect(selectRangeDate("2030-10-16","2030-10-18","2030-10-14","end")).toEqual({start:"2030-10-14",end:"2030-10-14"});
 expect(selectRangeDate("2030-10-16","2030-10-18","2030-11-01","end")).toEqual({start:"2030-10-16",end:"2030-11-01"});
});

it("starts afresh, completes a reverse interval across months, then restarts", async () => {
 const {selectCalendarRange}=await import("./activity-range-calendar");
 const first=selectCalendarRange(null,"2026-11-02");
 expect(first).toEqual({start:"2026-11-02",end:"2026-11-02",anchor:"2026-11-02"});
 const second=selectCalendarRange(first.anchor,"2026-10-30");
 expect(second).toEqual({start:"2026-10-30",end:"2026-11-02",anchor:null});
 expect(selectCalendarRange(second.anchor,"2026-12-01")).toEqual({start:"2026-12-01",end:"2026-12-01",anchor:"2026-12-01"});
 expect(selectCalendarRange("2026-12-01","2026-12-01").anchor).toBe(null);
});
