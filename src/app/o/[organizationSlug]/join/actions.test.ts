import { beforeEach, expect, it, vi } from "vitest";
import { submitMembershipApplication } from "./actions";
const start = vi.hoisted(() => vi.fn());
const getUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/membership/verification", () => ({ startMembershipApplication: start, resendMembershipVerification: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
function application() {
  const form = new FormData();
  for (const [key, value] of Object.entries({ organizationSlug: "ursvik-ik", playerFirstName: "Test", playerLastName: "Spelare", playerBirthDate: "2016-05-01", guardian1Email: "Guardian@Example.se", submittingUserId: "forged-member" })) form.set(key, value);
  return form;
}
beforeEach(() => {
  start.mockReset(); getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "server-verified-session" } } });
  start.mockResolvedValue({ application_id: "application-id", email_verified: false, delivery_failed: false });
});
it("takes the submitting identity from getUser rather than client fields", async () => {
  await expect(submitMembershipApplication(application())).rejects.toThrow("sent=verify");
  expect(start.mock.calls[0][1]).toBe("guardian@example.se");
  expect(start.mock.calls[0][2]).toBe("server-verified-session");
});
it("does not fabricate identity for anonymous applicants", async () => {
  getUser.mockResolvedValue({ data: { user: null } });
  await expect(submitMembershipApplication(application())).rejects.toThrow("sent=verify");
  expect(start.mock.calls[0][2]).toBeUndefined();
});
it("shows saved-application recovery when delivery fails", async () => {
  start.mockResolvedValue({ application_id: "application-id", email_verified: false, delivery_failed: true });
  await expect(submitMembershipApplication(application())).rejects.toThrow("application=application-id&deliveryFailed=1");
});
