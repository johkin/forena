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
