import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";
const client = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createClient: client }));
beforeEach(() => {
  client.mockReset();
  client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } });
});
const params = { params: Promise.resolve({ applicationId: "application" }) };
it.each([null, [], {}, { decision: "unknown" }, { decision: "rejected", rejectionReason: 123 },
  { decision: "rejected", rejectionReason: {} }, { decision: "approved", rejectionReason: null },
  { decision: "rejected", rejectionReason: "x".repeat(1001) },
])("rejects malformed review input before auth/database work: %j", async body => {
  const response = await POST(new Request("https://forena.test/review", { method: "POST", body: JSON.stringify(body) }), params);
  expect(response.status).toBe(400);
  expect(client).not.toHaveBeenCalled();
});
it("handles invalid JSON as a client error", async () => {
  const response = await POST(new Request("https://forena.test/review", { method: "POST", body: "{" }), params);
  expect(response.status).toBe(400);
  expect(client).not.toHaveBeenCalled();
});
it.each([{ decision: "approved" }, { decision: "rejected", rejectionReason: "En anledning" }])("continues to authenticate valid input: %j", async body => {
  const response = await POST(new Request("https://forena.test/review", { method: "POST", body: JSON.stringify(body) }), params);
  expect(response.status).toBe(401);
  expect(client).toHaveBeenCalledOnce();
});
