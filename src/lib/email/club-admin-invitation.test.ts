import { afterEach,expect,it,vi } from "vitest";
import { sendClubAdminInvitationEmail } from "./club-admin-invitation";
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it("escapes club names and links and uses an invitation-specific idempotency key",async()=>{
 vi.stubEnv("RESEND_API_KEY","test-key");vi.stubEnv("RESEND_FROM_EMAIL","admin@example.com");
 const send=vi.fn().mockResolvedValue({ok:true});vi.stubGlobal("fetch",send);
 await sendClubAdminInvitationEmail({to:"recipient@example.com",clubName:'<AIK & "friends">',invitationId:"invitation",invitationUrl:"https://example.com/club-admin-invite/token?x=1&y=2"});
 const request=send.mock.calls[0][1],body=JSON.parse(request.body);expect(body.html).toContain("&lt;AIK &amp; &quot;friends&quot;&gt;");expect(body.html).toContain("x=1&amp;y=2");expect(body.text).toContain("https://example.com/club-admin-invite/token?x=1&y=2");expect(request.headers["idempotency-key"]).toBe("club-admin-invite-invitation");
});
it("does not expose the provider response body on email failure",async()=>{
 vi.stubEnv("RESEND_API_KEY","test-key");vi.stubEnv("RESEND_FROM_EMAIL","admin@example.com");vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false,status:500,text:()=>"secret recipient and token"}));
 await expect(sendClubAdminInvitationEmail({to:"recipient@example.com",clubName:"AIK",invitationId:"invite",invitationUrl:"https://example.com/token"})).rejects.toThrow("E-postutskicket misslyckades (500).");
});
