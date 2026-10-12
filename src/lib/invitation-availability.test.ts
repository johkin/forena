import {expect,it} from "vitest";
import {invitationAvailable} from "./invitation-availability";
it("allows immediate invitations and the exact scheduled boundary, hides future or invalid times",()=>{
 const now=Date.parse("2030-10-12T12:00:00Z");
 expect(invitationAvailable(null,now)).toBe(true);
 expect(invitationAvailable("2030-10-12T12:00:00Z",now)).toBe(true);
 expect(invitationAvailable("2030-10-12T11:00:00Z",now)).toBe(true);
 expect(invitationAvailable("2030-10-12T12:00:01Z",now)).toBe(false);
 expect(invitationAvailable("invalid",now)).toBe(false);
});
