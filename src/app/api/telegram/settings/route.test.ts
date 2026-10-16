import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), available: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mocks }));
vi.mock("@/lib/telegram", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/telegram")>(), telegramAvailable: mocks.available }));
// Server clients keep auth on a separate namespace.
Object.assign(mocks, { auth: { getUser: mocks.getUser } });
import { GET, POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks(); mocks.getUser.mockResolvedValue({ data: { user: { id: "account" } } });
  mocks.available.mockReturnValue(true); mocks.rpc.mockResolvedValue({ data: { active: false }, error: null });
});
function request(body: unknown, origin = "https://forena.test") {
  return new Request("https://forena.test/api/telegram/settings", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
it("requires authentication for settings reads and writes", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  expect((await GET()).status).toBe(401); expect((await POST(request({ operation: "disable" }))).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects cross-origin mutations and requires explicit consent", async () => {
  expect((await POST(request({ operation: "start", consent: true }, "https://evil.test"))).status).toBe(403);
  expect((await POST(request({ operation: "start" }))).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("issues a random proof and stores only its hash without accepting a target account or phone", async () => {
  const response = await POST(request({ operation: "start", consent: true, user_id: "forged", phone: "1234" }));
  expect(response.status).toBe(200);
  const body = await response.json();
  const code = new URL(body.pairingUrl).searchParams.get("start")!;
  expect(code).toMatch(/^[a-f0-9]{64}$/);
  expect(mocks.rpc).toHaveBeenCalledWith("telegram_settings", { operation: "start", pairing_hash: expect.stringMatching(/^[a-f0-9]{64}$/) });
  expect(mocks.rpc.mock.calls[0][1].pairing_hash).not.toBe(code);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("allows opt-out even when the installation switch is off", async () => {
  mocks.available.mockReturnValue(false);
  expect((await POST(request({ operation: "disable" }))).status).toBe(200);
  expect((await POST(request({ operation: "start", consent: true }))).status).toBe(400);
});
it("returns a readable rate limit and does not leak database errors", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "54000", message: "sensitive" } });
  const response = await POST(request({ operation: "start", consent: true }));
  expect(response.status).toBe(429); expect(await response.text()).not.toContain("sensitive");
});
