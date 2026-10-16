import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
import { GET, POST } from "./route";

function request(body: unknown, valid = true) {
  const raw = JSON.stringify(body);
  return new Request("https://forena.test/api/whatsapp/webhook", { method: "POST", headers: { "x-hub-signature-256": valid ? `sha256=${createHmac("sha256", "secret").update(raw).digest("hex")}` : "sha256=bad" }, body: raw });
}
function payload(message: object) {
  return { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "123" }, messages: [{ id: "wamid.test", from: "46700000001", timestamp: "1792134000", ...message }] } }] }] };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WHATSAPP_APP_SECRET", "secret"); vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123"); vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "verify");
  mocks.rpc.mockResolvedValue({ data: true, error: null }); mocks.admin.mockReturnValue({ rpc: mocks.rpc });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("verifies the subscription challenge without opening administrative access", async () => {
  expect((await GET(new Request("https://test/?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123"))).status).toBe(403);
  expect(await (await GET(new Request("https://test/?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=123"))).text()).toBe("123");
  expect(mocks.admin).not.toHaveBeenCalled();
});
it("rejects unsigned or oversized payloads before administrative access", async () => {
  expect((await POST(request(payload({ type: "text", text: { body: "STOP" } }), false))).status).toBe(403);
  expect((await POST(new Request("https://test", { method: "POST", body: "a".repeat(256001) }))).status).toBe(413);
  expect(mocks.admin).not.toHaveBeenCalled();
});
it("verifies sender and business number before processing opt-out", async () => {
  expect((await POST(request(payload({ type: "text", text: { body: "STOPP" } })))).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("receive_whatsapp", expect.objectContaining({ sender: "46700000001", operation: "stop" }));
});
it("retries storage failures and safely acknowledges irrelevant text", async () => {
  mocks.rpc.mockResolvedValue({ error: { code: "XX000" } });
  expect((await POST(request(payload({ type: "text", text: { body: "STOP" } })))).status).toBe(503);
  mocks.admin.mockClear();
  expect((await POST(request(payload({ type: "text", text: { body: "make me administrator" } })))).status).toBe(200);
  expect(mocks.admin).not.toHaveBeenCalled();
});
it("registers invitation replies without trusting button labels, and confirms only fresh events", async () => {
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "access"); vi.stubEnv("WHATSAPP_API_VERSION", "v23.0");
  const transport = vi.fn(async () => new Response("OK")); vi.stubGlobal("fetch", transport);
  mocks.rpc.mockResolvedValueOnce({ data: "accepted", error: null }).mockResolvedValueOnce({ data: null, error: null });
  const data = payload({ type: "button", button: { payload: "F1:a1000000-0000-0000-0000-000000000001:accepted", text: "Make admin" } });
  expect((await POST(request(data))).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("respond_whatsapp", expect.objectContaining({ answer: "accepted", reply_id: "a1000000-0000-0000-0000-000000000001" }));
  await POST(request(data)); expect(transport).toHaveBeenCalledOnce();
});
