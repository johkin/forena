import { describe, expect, it } from "vitest";
import { systemAdminInvitationPath } from "./platform-admin-invitation-token";

describe("platform invitation redirect path", () => {
  it("accepts a base64url token", () => {
    const token = "Ab_-" + "1".repeat(39);
    expect(systemAdminInvitationPath(token)).toBe(`/system-admin-invite/${encodeURIComponent(token)}`);
  });
  it.each(["", "abc?next=/system", "abc#fragment", "../system", "/", "x".repeat(44), null, 123])("rejects malformed token %s", token => {
    expect(systemAdminInvitationPath(token)).toBeNull();
  });
});
