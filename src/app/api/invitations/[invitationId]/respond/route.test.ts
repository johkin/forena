import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({getUser:vi.fn(),update:vi.fn(),eq:vi.fn(),select:vi.fn(),maybeSingle:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:mocks.getUser},from:()=>({update:mocks.update})})}));
import { PUT } from "./route";
const answer=(body:unknown)=>PUT(new Request("https://test/api/invitations/i/respond",{method:"PUT",body:JSON.stringify(body)}),{params:Promise.resolve({invitationId:"i"})});
beforeEach(()=>{vi.clearAllMocks();mocks.getUser.mockResolvedValue({data:{user:{id:"self"}}});mocks.update.mockReturnValue({eq:mocks.eq});mocks.eq.mockReturnValue({select:mocks.select});mocks.select.mockReturnValue({maybeSingle:mocks.maybeSingle});mocks.maybeSingle.mockResolvedValue({data:{id:"i"},error:null});});
it("keeps an existing comment untouched when a quick reply omits it",async()=>{
 expect((await answer({response:"accepted"})).status).toBe(200);
 expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("response_comment");
 expect(mocks.eq).toHaveBeenCalledWith("id","i");
});
it("still supports explicit comment editing and resets comments when clearing an answer",async()=>{
 await answer({response:"declined",comment:"  Förhinder  "});
 expect(mocks.update.mock.calls[0][0]).toHaveProperty("response_comment","Förhinder");
 await answer({response:"accepted",comment:""});expect(mocks.update.mock.calls[1][0]).toHaveProperty("response_comment",null);
 await answer({response:"pending"});expect(mocks.update.mock.calls[2][0]).toMatchObject({response_comment:null,responded_at:null});
});
it("rejects missing sessions without writes",async()=>{
 mocks.getUser.mockResolvedValue({data:{user:null}});expect((await answer({response:"accepted"})).status).toBe(401);expect(mocks.update).not.toHaveBeenCalled();
});
it.each([{data:null,error:null},{data:null,error:{code:"42501"}}])("does not claim success for a denied or absent invitation",async result=>{
 mocks.maybeSingle.mockResolvedValue(result);expect((await answer({response:"accepted"})).status).toBe(403);
});
