import { afterEach, expect, it, vi } from "vitest";
import { sendMembershipVerificationEmail } from "./membership-verification";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("escapes the link and includes a plain-text alternative without child data", async () => {
  vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("RESEND_FROM_EMAIL", "test@example.se");
  const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 })); vi.stubGlobal("fetch", fetch);
  await sendMembershipVerificationEmail({ to: "guardian@example.se", verificationUrl: 'https://forena.test/?x="<test>', idempotencyKey: "test-send" });
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.html).toContain("&quot;&lt;test&gt;");
  expect(body.text).toContain("24 timmar"); expect(body.text).toContain("https://forena.test/");
  expect(fetch.mock.calls[0][1].headers["idempotency-key"]).toBe("test-send");
});
it("does not include provider response bodies in errors", async () => {
  vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("RESEND_FROM_EMAIL", "test@example.se");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret token and address", { status: 500 })));
  await expect(sendMembershipVerificationEmail({ to: "guardian@example.se", verificationUrl: "https://forena.test/", idempotencyKey: "test-send" })).rejects.toThrow("E-postutskicket misslyckades (500).");
});
