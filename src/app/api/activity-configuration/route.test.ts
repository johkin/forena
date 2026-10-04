import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
const mocks=vi.hoisted(()=>({createClient:vi.fn(),load:vi.fn(),auth:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:mocks.createClient}));
vi.mock("@/lib/activity-configuration",()=>({loadActivityConfiguration:mocks.load}));
const teamId="e3000000-0000-0000-0000-000000000001";
beforeEach(()=>{
 vi.clearAllMocks();mocks.createClient.mockResolvedValue({auth:{getUser:mocks.auth},rpc:mocks.rpc});mocks.auth.mockResolvedValue({data:{user:{id:"leader"}}});mocks.rpc.mockResolvedValue({data:true,error:null});mocks.load.mockResolvedValue({types:[]});
});
describe("activity configuration access",()=>{
 it("rejects malformed team identifiers before querying the database",async()=>{expect((await GET(new Request("https://example.test/api/activity-configuration?teamId=bad"))).status).toBe(400);expect(mocks.createClient).not.toHaveBeenCalled();});
 it("requires an authenticated account",async()=>{mocks.auth.mockResolvedValue({data:{user:null}});expect((await GET(new Request(`https://example.test/api/activity-configuration?teamId=${teamId}`))).status).toBe(401);expect(mocks.load).not.toHaveBeenCalled();});
 it("denies configuration before reading it when team permission fails",async()=>{mocks.rpc.mockResolvedValue({data:false,error:null});expect((await GET(new Request(`https://example.test/api/activity-configuration?teamId=${teamId}`))).status).toBe(403);expect(mocks.load).not.toHaveBeenCalled();});
 it("returns authorized configuration without shared-cache storage",async()=>{const result=await GET(new Request(`https://example.test/api/activity-configuration?teamId=${teamId}`));expect(result.status).toBe(200);expect(result.headers.get("cache-control")).toBe("private, no-store");expect(mocks.rpc).toHaveBeenCalledWith("has_team_permission",{target_team_id:teamId,target_permission:"activity.manage"});});
 it("fails closed if a defaults query fails",async()=>{mocks.load.mockRejectedValue(new Error("Internal database message"));const response=await GET(new Request(`https://example.test/api/activity-configuration?teamId=${teamId}`));expect(response.status).toBe(500);expect(JSON.stringify(await response.json())).not.toContain("Internal database message");});
});
