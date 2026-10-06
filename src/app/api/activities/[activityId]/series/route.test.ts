import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({client:vi.fn(),rpc:vi.fn(),getUser:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:mocks.client}));
import { DELETE } from "./route";
const id="a6000000-0000-4000-8000-000000000001";
const request=(body:unknown)=>DELETE(new Request("https://example.test/api/activities/series",{method:"DELETE",body:JSON.stringify(body)}),{params:Promise.resolve({activityId:id})});
beforeEach(()=>{
 vi.clearAllMocks();mocks.client.mockResolvedValue({auth:{getUser:mocks.getUser},rpc:mocks.rpc});
 mocks.getUser.mockResolvedValue({data:{user:{id:"leader"}}});
 mocks.rpc.mockResolvedValue({data:{count:2,token:"preview"},error:null});
});
it("requires login before accessing the series",async()=>{
 mocks.getUser.mockResolvedValue({data:{user:null}});
 expect((await request({preview:true})).status).toBe(401);expect(mocks.rpc).not.toHaveBeenCalled();
});
it("previews without deleting and forwards the confirmation token",async()=>{
 expect((await request({preview:true})).status).toBe(200);
 expect(mocks.rpc).toHaveBeenLastCalledWith("delete_activity_series_from",{target_activity_id:id,preview_only:true,expected_token:undefined});
 await request({preview:false,token:"preview"});
 expect(mocks.rpc).toHaveBeenLastCalledWith("delete_activity_series_from",{target_activity_id:id,preview_only:false,expected_token:"preview"});
});
it("rejects deletion without a preview token",async()=>{
 expect((await request({preview:false})).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([["42501",403],["40001",409]])("propagates permission and changed-preview failures %s",async(code,status)=>{
 mocks.rpc.mockResolvedValue({data:null,error:{code,message:"Avvisad"}});
 expect((await request({preview:false,token:"old"})).status).toBe(status);
});
