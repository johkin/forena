import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), admin: vi.fn(), transport: vi.fn(), assistant: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/telegram-assistant", () => ({ answerTelegramQuestion: mocks.assistant, telegramAssistantEnabled: () => process.env.TELEGRAM_ASSISTANT_ENABLED === "true" }));
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
  vi.stubEnv("TELEGRAM_ASSISTANT_ENABLED", "false");
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

it("offers the same identity-free profile link to every private sender without admin access", async () => {
  for (const sender of [123, 456]) {
    await POST(request({ update_id: 99, message: { ...message, from: { id: sender }, chat: { id: sender, type: "private" }, text: "/help" } }));
    const body = JSON.parse(mocks.transport.mock.calls.at(-1)![1].body);
    expect(body.reply_markup.inline_keyboard[0][0].url).toBe("https://forena.test/profile#telegram");
    expect(body.text).toContain("din egen enhet");
  }
  expect(mocks.admin).not.toHaveBeenCalled();
});
it("ignores retired bind callbacks so an old bot-selected destination cannot be linked", async () => {
  await POST(request({ update_id: 99, callback_query: { ...callback.callback_query, data: "B1:" + "x".repeat(43) } }));
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.transport).not.toHaveBeenCalled();
});
it.each(["accepted", "declined"])("confirms %s with the child's name and updates escaped text and selected color", async answer => {
  const frozen = { person: "Tilda <&>", team: "Team", activity: "Match", when: "2026-10-18 10:00", gathering: "09:30", location: "Field", due: "Tomorrow", url: `/activities/${id}` };
  mocks.rpc.mockResolvedValueOnce({ data: answer, error: null }).mockResolvedValueOnce({ data: { text: "legacy", url: frozen.url, message: frozen }, error: null });
  await POST(request(callback));
  const calls = mocks.transport.mock.calls.map(c => ({ url: c[0], body: JSON.parse(c[1].body) }));
  expect(calls[0].body.text).toBe(answer === "accepted" ? "Tilda <&> kommer." : "Tilda <&> kan inte komma.");
  expect(calls[1].body.parse_mode).toBe("HTML");
  expect(calls[1].body.text).toContain("Tilda &lt;&amp;&gt;");
  expect(calls[1].body.reply_markup.inline_keyboard[0][answer === "accepted" ? 0 : 1].style).toBe(answer === "accepted" ? "success" : "danger");
});

it("delegates enabled private questions and sends only text to the sender", async () => {
  vi.stubEnv("TELEGRAM_ASSISTANT_ENABLED", "true");
  mocks.assistant.mockResolvedValue("Träning på tisdag");
  expect((await POST(request({ update_id: 101, message: { ...message, text: "När tränar vi?" } }))).status).toBe(200);
  expect(mocks.assistant).toHaveBeenCalledWith(expect.objectContaining({ sender: "123", chatId: "123", question: "När tränar vi?", messageId: "u:101" }));
  const body = JSON.parse(mocks.transport.mock.calls.at(-1)![1].body);
  expect(body).toMatchObject({ chat_id: "123", text: "Träning på tisdag", protect_content: true });
  expect(body.parse_mode).toBeUndefined();
  expect(mocks.admin).not.toHaveBeenCalled();
});
it("never delegates group questions, even when the assistant is enabled", async () => {
  vi.stubEnv("TELEGRAM_ASSISTANT_ENABLED", "true");
  for (const text of ["När tränar vi?", "/ask ursvik/f2016 När tränar vi?"]) {
    await POST(request({ update_id: 102, message: { ...message, chat: { id: -123, type: "supergroup" }, text } }));
  }
  expect(mocks.assistant).not.toHaveBeenCalled();
  expect(mocks.transport).not.toHaveBeenCalled();
});
it("acknowledges a suppressed or duplicate answer without sending it", async () => {
  vi.stubEnv("TELEGRAM_ASSISTANT_ENABLED", "true"); mocks.assistant.mockResolvedValue(null);
  expect((await POST(request({ update_id: 103, message: { ...message, text: "Hej" } }))).status).toBe(200);
  expect(mocks.transport).not.toHaveBeenCalled();
});

it("explains that questions are disabled instead of repeating enrollment instructions", async () => {
  await POST(request({ update_id: 200, message: { ...message, text: "När är nästa träning?" } }));
  const body = JSON.parse(mocks.transport.mock.calls[0][1].body);
  expect(body.text).toContain("Frågestödet i Telegram är inte aktiverat");
  expect(body.text).not.toContain("Välkommen till Förena");
  expect(mocks.assistant).not.toHaveBeenCalled();
  expect(mocks.admin).not.toHaveBeenCalled();
});
