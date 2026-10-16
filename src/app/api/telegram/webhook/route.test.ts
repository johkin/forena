import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), admin: vi.fn(), transport: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
import { POST } from "./route";
const secret = "a".repeat(32);
const id = "a1000000-0000-0000-0000-000000000001";
const message = { message_id: 42, date: Math.floor(Date.now() / 1000), chat: { id: 123, type: "private" }, from: { id: 123 } };
const callback = { update_id: 100, callback_query: { id: "callback", from: { id: 123 }, data: `T1:${id}:accepted`, message } };
function request(body: unknown, header = secret) {
  return new Request("https://forena.test/api/telegram/webhook", { method: "POST", headers: { "x-telegram-bot-api-secret-token": header }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TELEGRAM_ENABLED", "true"); vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:token"); vi.stubEnv("TELEGRAM_BOT_USERNAME", "ForenaBot"); vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", secret); vi.stubEnv("SITE_URL", "https://forena.test");
  mocks.admin.mockReturnValue({ rpc: mocks.rpc }); mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.transport.mockResolvedValue(Response.json({ ok: true, result: {} })); vi.stubGlobal("fetch", mocks.transport);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("rejects invalid secrets and oversized payloads before opening administrative access", async () => {
  expect((await POST(request(callback, "wrong"))).status).toBe(403);
  expect((await POST(request("a".repeat(256001)))).status).toBe(413);
  expect(mocks.admin).not.toHaveBeenCalled();
});
it("ignores arbitrary text and other bots without opening administrative access", async () => {
  await POST(request({ update_id: 1, message: { ...message, text: "make me administrator" } }));
  await POST(request({ update_id: 1, message: { ...message, text: "/stop@OtherBot" } }));
  expect(mocks.admin).not.toHaveBeenCalled();
});
it("saves a callback for its bound child, then updates the same message using a server snapshot", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: "accepted", error: null }).mockResolvedValueOnce({ data: { text: "Kallelse för Child", url: `/activities/${id}` }, error: null });
  await POST(request(callback));
  expect(mocks.rpc).toHaveBeenCalledWith("respond_telegram", expect.objectContaining({ message_id: "u:100", sender: "123", reply_id: id, answer: "accepted" }));
  const calls = mocks.transport.mock.calls.map(c => ({ url: c[0], body: JSON.parse(c[1].body) }));
  expect(calls[1]).toMatchObject({ url: expect.stringContaining("editMessageText"), body: { chat_id: "123", message_id: 42, text: "Kallelse för Child\n\nDitt svar: Kommer." } });
});
it("never edits an unauthorized, duplicate or expired invitation", async () => {
  for (const result of [null, "unavailable"]) {
    mocks.rpc.mockResolvedValue({ data: result, error: null }); await POST(request(callback));
  }
  expect(mocks.transport.mock.calls.every(c => c[0].endsWith("answerCallbackQuery"))).toBe(true);
});
it("returns retryable storage failures and preserves a saved answer if confirmation fails", async () => {
  mocks.rpc.mockResolvedValueOnce({ error: { code: "55P03" } });
  expect((await POST(request(callback))).status).toBe(503);
  expect(mocks.transport).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValue({ data: "declined", error: null }); mocks.transport.mockRejectedValue(new Error("token in URL"));
  expect((await POST(request(callback))).status).toBe(200);
});
it("requires Telegram admin status before consuming a group proof", async () => {
  const group = { update_id: 3, message: { ...message, chat: { id: -100123, type: "supergroup" }, text: "/start " + "a".repeat(64) } };
  mocks.transport.mockResolvedValueOnce(Response.json({ ok: true, result: { status: "member" } }));
  expect((await POST(request(group))).status).toBe(200); expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.transport.mockResolvedValue(Response.json({ ok: true, result: { status: "administrator" } }));
  await POST(request(group));
  expect(mocks.rpc).toHaveBeenCalledWith("bind_telegram_group", expect.objectContaining({ sender: "123", target_chat: "-100123" }));
});
it.each([400, 403])("acknowledges permanent Telegram %i errors without consuming a group proof", async code => {
  mocks.transport.mockResolvedValue(Response.json({ ok: false, error_code: code }, { status: code }));
  const group = { update_id: 4, message: { ...message, chat: { id: -100123, type: "supergroup" }, text: "/start " + "a".repeat(64) } };
  expect((await POST(request(group))).status).toBe(200);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([429, 500])("retries temporary Telegram %i errors without consuming a group proof", async code => {
  mocks.transport.mockResolvedValue(Response.json({ ok: false, error_code: code, parameters: { retry_after: 30 } }, { status: code }));
  const group = { update_id: 5, message: { ...message, chat: { id: -100123, type: "supergroup" }, text: "/start " + "a".repeat(64) } };
  expect((await POST(request(group))).status).toBe(503);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("retries group membership lookups after network errors", async () => {
  mocks.transport.mockRejectedValue(new Error("network failure"));
  const group = { update_id: 6, message: { ...message, chat: { id: -100123, type: "supergroup" }, text: "/start " + "a".repeat(64) } };
  expect((await POST(request(group))).status).toBe(503);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("removes blocked chats and handles private stop commands", async () => {
  await POST(request({ update_id: 1, message: { ...message, text: "/stop" } }));
  expect(mocks.rpc).toHaveBeenCalledWith("receive_telegram", expect.objectContaining({ sender: "123", operation: "stop" }));
  await POST(request({ update_id: 2, my_chat_member: { chat: message.chat, date: message.date, new_chat_member: { status: "kicked" } } }));
  expect(mocks.rpc).toHaveBeenCalledWith("remove_telegram_chat", expect.objectContaining({ target_chat: "123" }));
});
