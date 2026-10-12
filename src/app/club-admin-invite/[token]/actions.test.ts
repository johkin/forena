import { createHash } from "node:crypto";
import { beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({client:vi.fn(),revalidate:vi.fn(),redirect:vi.fn((path:string)=>{throw Error(path);})}));
vi.mock("@/lib/supabase/server",()=>({createClient:mocks.client}));
vi.mock("next/navigation",()=>({redirect:mocks.redirect}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
import { acceptClubAdministratorInvitation } from "./actions";
const token="a".repeat(43);
function form(value=token){const f=new FormData();f.set("token",value);return f;}
beforeEach(()=>vi.clearAllMocks());
it("requires login without consuming the invitation",async()=>{
 const rpc=vi.fn();mocks.client.mockResolvedValue({auth:{getUser:vi.fn().mockResolvedValue({data:{user:null}})},rpc});await expect(acceptClubAdministratorInvitation(form())).rejects.toThrow("/login?next=");expect(rpc).not.toHaveBeenCalled();
});
it("hashes the token and redirects into the joined club only after database acceptance",async()=>{
 const rpc=vi.fn().mockResolvedValue({data:{slug:"aik"},error:null});mocks.client.mockResolvedValue({auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:"user"}}})},rpc});await expect(acceptClubAdministratorInvitation(form())).rejects.toThrow("/o/aik/admin/sections?adminJoined=1");expect(rpc).toHaveBeenCalledWith("accept_club_admin_invite",{invitation_token_hash:createHash("sha256").update(token).digest("hex")});expect(mocks.revalidate).toHaveBeenCalledWith("/","layout");
});
it("retains the invitation error when the account or token does not match",async()=>{
 const rpc=vi.fn().mockResolvedValue({data:null,error:{code:"22023"}});mocks.client.mockResolvedValue({auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:"wrong"}}})},rpc});await expect(acceptClubAdministratorInvitation(form())).rejects.toThrow(`/club-admin-invite/${token}?error=`);expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("rejects malformed links before any client or database access",async()=>{
 await expect(acceptClubAdministratorInvitation(form("../system"))).rejects.toThrow("/login?error=");expect(mocks.client).not.toHaveBeenCalled();
});
