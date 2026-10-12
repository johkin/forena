import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), send: vi.fn(), revalidate: vi.fn(), redirect: vi.fn((path: string) => { throw Error(path); }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/email/club-admin-invitation", () => ({ sendClubAdminInvitationEmail: mocks.send }));
vi.mock("@/lib/site-url", () => ({ getSiteUrl: () => "https://forena.example" }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { becomeClubAdministrator, removeClubAdministrator, inviteClubAdministrator, cancelClubAdministratorInvitation } from "./club-administrator-actions";
const org = "c3000000-0000-0000-0000-000000000001", invite = "d3000000-0000-0000-0000-000000000001";
function form(values: Record<string, string> = {}) { const data = new FormData(); for (const [key,value] of Object.entries({ organizationId: org, ...values })) data.set(key,value); return data; }
function setup(allowed = true) {
 const rpc = vi.fn().mockImplementation(async (_name, input) => ({ data: _name === "has_platform_role" ? allowed : input.operation === "invite" ? { invitationId: invite, clubName: "AIK" } : {}, error: null }));
 mocks.client.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user" } }, error: null }) }, rpc });
 return rpc;
}
beforeEach(() => { vi.clearAllMocks(); mocks.send.mockReset().mockResolvedValue(undefined); });
it.each([becomeClubAdministrator,removeClubAdministrator,inviteClubAdministrator,cancelClubAdministratorInvitation])("requires system administration for every mutation", async action => {
 const rpc = setup(false); await expect(action(form())).rejects.toThrow("/"); expect(rpc).toHaveBeenCalledTimes(1); expect(mocks.send).not.toHaveBeenCalled();
});
it("adds the signed-in system administrator without sending an email", async () => {
 const rpc = setup(); await expect(becomeClubAdministrator(form())).rejects.toThrow("adminMessage="); expect(rpc).toHaveBeenLastCalledWith("system_club_admins", { target: org, operation: "self" }); expect(mocks.send).not.toHaveBeenCalled();
});
it("sends a recipient-bound link while storing only its hash", async () => {
 const rpc = setup(); await expect(inviteClubAdministrator(form({email:" Receiver@Example.com "}))).rejects.toThrow("adminMessage=");
 const input = rpc.mock.calls.find(call=>call[1]?.operation === "invite")![1];
 expect(input.payload.email).toBe("receiver@example.com"); expect(input.payload.tokenHash).toMatch(/^[a-f0-9]{64}$/); expect(input.payload.token).toBeUndefined();
 expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to:"receiver@example.com", invitationUrl:expect.stringMatching(/^https:\/\/forena.example\/club-admin-invite\/[A-Za-z0-9_-]{43}$/) }));
 expect(rpc).toHaveBeenLastCalledWith("system_club_admins",{target:org,operation:"delivery",payload:{invitationId:invite,sent:true}});
});
it("marks a failed email so the invitation cannot be accepted",async()=>{
 const rpc=setup();mocks.send.mockRejectedValue(Error("network"));await expect(inviteClubAdministrator(form({email:"receiver@example.com"}))).rejects.toThrow("error=");expect(rpc).toHaveBeenLastCalledWith("system_club_admins",{target:org,operation:"delivery",payload:{invitationId:invite,sent:false}});
});
it("reports delivery-record errors without resending an email",async()=>{
 const rpc=setup();rpc.mockImplementation(async(name,input)=>({data:name==="has_platform_role"?true:{invitationId:invite,clubName:"AIK"},error:input?.operation==="delivery"?{code:"XX000"}:null}));
 await expect(inviteClubAdministrator(form({email:"receiver@example.com"}))).rejects.toThrow("error=");expect(mocks.send).toHaveBeenCalledTimes(1);
});
it("binds administrator removal to the selected club and user",async()=>{
 const rpc=setup();await expect(removeClubAdministrator(form({userId:invite}))).rejects.toThrow("adminMessage=");expect(rpc).toHaveBeenLastCalledWith("system_club_admins",{target:org,operation:"remove",payload:{userId:invite}});
});
