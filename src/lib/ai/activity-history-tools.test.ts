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
