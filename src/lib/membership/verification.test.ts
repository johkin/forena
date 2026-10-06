import { beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { getVerificationContext, resendMembershipVerification, startMembershipApplication, verificationHash, verifyMembershipEmail } from "./verification";

const rpc = vi.hoisted(() => vi.fn());
const send = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/email/membership-verification", () => ({ sendMembershipVerificationEmail: send }));
vi.mock("@/lib/site-url", () => ({ getSiteUrl: () => "https://forena.test" }));
beforeEach(() => { rpc.mockReset(); send.mockReset(); send.mockResolvedValue(undefined); });

it("saves only a hash and emails the token without exposing it to the applicant", async () => {
  rpc.mockResolvedValue({ data: [{ application_id: "test-id", email_verified: false }], error: null });
  const result = await startMembershipApplication({ guardians: [] }, "guardian@example.se");
  const email = send.mock.calls[0][0];
  const token = email.verificationUrl.split("/").at(-1);
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(rpc.mock.calls[0][1]).toEqual({ payload: { guardians: [] }, submitting_user_id: null,
    verification_token_hash: createHash("sha256").update(token).digest("hex") });
  expect(result).toEqual({ application_id: "test-id", email_verified: false, delivery_failed: false });
});
it("lets the database decide whether a verified member can skip email", async () => {
  rpc.mockResolvedValue({ data: [{ application_id: "test-id", email_verified: true }], error: null });
  await startMembershipApplication({}, "guardian@example.se", "verified-session-user");
  expect(rpc.mock.calls[0][1].submitting_user_id).toBe("verified-session-user");
  expect(send).not.toHaveBeenCalled();
});
it("preserves a saved application when sending fails, without disclosing its token", async () => {
  rpc.mockResolvedValue({ data: [{ application_id: "test-id", email_verified: false }], error: null });
  send.mockRejectedValue(new Error("provider body including secrets"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await startMembershipApplication({}, "guardian@example.se")).toEqual({
    application_id: "test-id", email_verified: false, delivery_failed: true,
  });
  expect(log).toHaveBeenCalledWith("[membership-verification] delivery failed", { applicationId: "test-id" });
  log.mockRestore();
});
it("does not email unknown applications, mismatching addresses or throttled requests", async () => {
  rpc.mockResolvedValue({ data: false, error: null });
  await resendMembershipVerification("a0000000-0000-0000-0000-000000000001", "wrong@example.se");
  expect(send).not.toHaveBeenCalled();
});
it("sends a freshly prepared link on allowed resend", async () => {
  rpc.mockResolvedValue({ data: true, error: null });
  await resendMembershipVerification("a0000000-0000-0000-0000-000000000001", "guardian@example.se");
  expect(send).toHaveBeenCalledOnce();
});
it("rejects invalid tokens before any privileged database request", async () => {
  expect(() => verificationHash("<script>")).toThrow();
  await expect(verifyMembershipEmail("invalid")).rejects.toThrow();
  expect(await getVerificationContext("invalid")).toBeNull();
  expect(rpc).not.toHaveBeenCalled();
});
it("reports expired or replaced tokens as errors", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "expired" } });
  await expect(verifyMembershipEmail("a".repeat(43))).rejects.toThrow("Länken är ogiltig");
});
it("returns the database-derived club after confirmation", async () => {
  rpc.mockResolvedValue({ data: "ursvik-ik", error: null });
  expect(await verifyMembershipEmail("a".repeat(43))).toBe("ursvik-ik");
});
