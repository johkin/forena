import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({client:vi.fn(),rpc:vi.fn(),auth:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:mocks.client}));
import { GET,PUT } from "./route";
const teamId="fc300000-0000-4000-8000-000000000001";
beforeEach(()=>{
 vi.clearAllMocks();mocks.auth.mockResolvedValue({data:{user:{id:"actor"}}});
 mocks.rpc.mockResolvedValue({data:{enabled:true,disciplineKey:"football",version:"1.0.0",values:{},revision:1},error:null});
 mocks.client.mockResolvedValue({auth:{getUser:mocks.auth},rpc:mocks.rpc});
});
const save=(body:unknown)=>PUT(new Request("http://localhost/api/discipline-fields",{method:"PUT",body:JSON.stringify(body)}));
it("dispatches through the authorized package and passes its identity to the write",async()=>{
 expect((await save({teamId,scope:"team",values:{targetTeamSize:9},revision:1})).status).toBe(200);
 expect(mocks.rpc.mock.calls[1]).toEqual(["discipline_fields",expect.objectContaining({new_values:{targetTeamSize:9},expected_discipline_key:"football",expected_revision:1})]);
});
it("rejects a stale package identity without writing",async()=>{
 expect((await save({teamId,scope:"team",disciplineKey:"swimming",values:{targetTeamSize:9},revision:1})).status).toBe(409);
 expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it("validates against the resolved scope schema",async()=>{
 expect((await save({teamId,scope:"team",values:{shirtNumber:7},revision:1})).status).toBe(400);
 expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it("never falls back to football for an unregistered discipline",async()=>{
 mocks.rpc.mockResolvedValue({data:{enabled:true,disciplineKey:"swimming",version:"1.0.0"},error:null});
 expect((await save({teamId,scope:"team",values:{},revision:1})).status).toBe(409);
 expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it("does not resolve private package data before authentication",async()=>{
 mocks.auth.mockResolvedValue({data:{user:null}});
 expect((await GET(new Request(`http://localhost/api/discipline-fields?teamId=${teamId}&scope=team`))).status).toBe(401);
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it("detects a stale package on read and keeps responses private",async()=>{
 const response=await GET(new Request(`http://localhost/api/discipline-fields?teamId=${teamId}&scope=team&disciplineKey=swimming`));
 expect(response.status).toBe(409);expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});

it.each([["42501",403],["P0002",404],["unexpected",500]])("maps preflight error %s without exposing database details",async(code,status)=>{
 mocks.rpc.mockResolvedValue({data:null,error:{code,message:"private details"}});
 const response=await save({teamId,scope:"team",values:{},revision:1});
 expect(response.status).toBe(status);expect(await response.text()).not.toContain("private details");
 expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
