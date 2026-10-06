import { expect, it, vi } from "vitest";
import { createActivityHistoryTools } from "./activity-history-tools";
import type { AssistantDependencies } from "./team-assistant-types";
const team="00000000-0000-0000-0000-000000000001";
const options={} as never;
function setup(attendance=true,work=true) {
 const rpc=vi.fn(async(name:string)=>name==="activity_history_teams"?{data:[{id:team,canReadAttendance:attendance,canReadWork:work}],error:null}:{data:{records:[],truncated:false},error:null});
 const tools=createActivityHistoryTools({rpc} as unknown as AssistantDependencies["supabase"],"org",team);
 return {rpc,tools,read:(overrides={})=>tools.readActivityHistory.execute!({from:"2026-09-01",through:"2026-09-30",category:"session",guestsOnly:true,...overrides},options)};
}
it("queries historical guest attendance in the current team",async()=>{
 const {rpc,read}=setup();await read();expect(rpc).toHaveBeenLastCalledWith("read_activity_history",{target_team_id:team,from_date:"2026-09-01",through_date:"2026-09-30",category:"session",guests_only:true});
});
it("rejects unlisted teams before requesting their history",async()=>{
 const {rpc,read}=setup();expect(await read({teamId:"other-team"})).toHaveProperty("error");expect(rpc).toHaveBeenCalledTimes(1);
});
it("distinguishes work and attendance permissions",async()=>{
 const {rpc,read}=setup(false,true);expect(await read()).toHaveProperty("error");expect(rpc).toHaveBeenCalledTimes(1);
 expect(await read({category:"work"})).toEqual({records:[],truncated:false});
});
it("does not turn query failures into empty history",async()=>{
 const {rpc,read}=setup();rpc.mockResolvedValueOnce({data:null,error:{code:"error"}} as never);expect(await read()).toHaveProperty("error");
});
it("preserves incomplete result metadata",async()=>{
 const {rpc,read}=setup();rpc.mockImplementation(async(name:string)=>name==="activity_history_teams"?{data:[{id:team,canReadAttendance:true,canReadWork:true}],error:null}:{data:{records:[],truncated:true,unreportedActivityCount:5},error:null} as never);
 expect(await read()).toMatchObject({truncated:true,unreportedActivityCount:5});
});


it("resolves a relative period on the server and forwards complete result metadata", async () => {
 const {rpc}=setup();
 const result={team:"Lag A",from:"2026-09-16",through:"2026-10-06",category:"session",timeZone:"Europe/Stockholm",activityCount:6,unreportedActivityCount:1,truncated:true,summary:{uniquePeople:40,participationCount:240},activities:[],records:[]};
 rpc.mockImplementation(async(name:string)=>name==="activity_history_teams"?{data:[{id:team,canReadAttendance:true,canReadWork:true}],error:null}:{data:result,error:null} as never);
 const onResult=vi.fn();
 const tools=createActivityHistoryTools({rpc} as unknown as AssistantDependencies["supabase"],"org",team,{today:"2026-10-06",onResult});
 await tools.readActivityHistory.execute!({relativeDays:21,category:"session",guestsOnly:false},options);
 expect(rpc).toHaveBeenLastCalledWith("read_activity_history",expect.objectContaining({from_date:"2026-09-16",through_date:"2026-10-06"}));
 expect(onResult).toHaveBeenCalledWith(expect.objectContaining({summary:{uniquePeople:40,participationCount:240},truncated:true}));
});
it("uses the period resolved from the current question without requiring model dates",async()=>{
 const {rpc}=setup();
 const tools=createActivityHistoryTools({rpc} as unknown as AssistantDependencies["supabase"],"org",team,{today:"2026-10-06",period:{from:"2026-09-16",through:"2026-10-06"},onResult:vi.fn()});
 await tools.readActivityHistory.execute!({category:"session",guestsOnly:false},options);
 expect(rpc).toHaveBeenLastCalledWith("read_activity_history",expect.objectContaining({from_date:"2026-09-16",through_date:"2026-10-06"}));
});
it("rejects incomplete or conflicting periods before database access",async()=>{
 const {rpc,tools}=setup();
 expect(await tools.readActivityHistory.execute!({from:"2026-10-06",category:"session",guestsOnly:false},options)).toHaveProperty("error");
 expect(await tools.readActivityHistory.execute!({from:"2026-10-06",through:"2026-10-01",category:"session",guestsOnly:false},options)).toHaveProperty("error");
 expect(await tools.readActivityHistory.execute!({from:"2026-10-01",through:"2026-10-06",relativeDays:21,category:"session",guestsOnly:false},options)).toHaveProperty("error");
 expect(rpc).not.toHaveBeenCalled();
});

it.each([
 {from:"2026-09-01"},
 {through:"2026-09-30"},
 {from:"2026-10-01",through:"2026-10-06",relativeDays:21},
])("uses the question's canonical month despite incomplete or conflicting model dates %j",async(args)=>{
 const {rpc}=setup();
 const tools=createActivityHistoryTools({rpc} as unknown as AssistantDependencies["supabase"],"org",team,{today:"2026-10-07",period:{from:"2026-09-01",through:"2026-09-30"},onResult:vi.fn()});
 await tools.readActivityHistory.execute!({category:"session",guestsOnly:false,...args},options);
 expect(rpc).toHaveBeenLastCalledWith("read_activity_history",expect.objectContaining({from_date:"2026-09-01",through_date:"2026-09-30"}));
});
