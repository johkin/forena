import { describe, expect, it, vi } from "vitest";
import { telegramAction, telegramPairingHash, verifyTelegramSecret } from "./telegram";
import { sendTelegramNotification, TelegramError, telegramApi, type TelegramInvitation, telegramInvitationText, telegramKeyboard } from "../../supabase/functions/_shared/telegram";

const reply = "a1000000-0000-0000-0000-000000000001";
const config = { token: "123:test_secret", siteUrl: "https://forena.test" };
const msg = { message_id: 12, date: 1792134000, chat: { id: 123, type: "private" }, from: { id: 123 }, text: "/start " + "a".repeat(64) };
it("checks the Telegram webhook secret, including malformed Unicode headers", () => {
  const secret = "a".repeat(32);
  expect(verifyTelegramSecret(secret, secret)).toBe(true);
  for (const v of [null, "", "b".repeat(32), "é".repeat(32)]) expect(verifyTelegramSecret(v, secret)).toBe(false);
});
it("only links private chats owned by the sender and hashes the deep-link proof", () => {
  expect(telegramAction({ update_id: 1, message: msg }, "ForenaBot")).toMatchObject({ operation: "bind", sender: "123", pairingHash: telegramPairingHash("a".repeat(64)) });
  expect(telegramAction({ update_id: 1, message: { ...msg, from: { id: 456 } } }, "ForenaBot")).toBeNull();
});
it("distinguishes group pairing from private pairing and ignores other bots and anonymous admins", () => {
  const group = { ...msg, chat: { id: -100123, type: "supergroup" }, text: "/start@ForenaBot " + "a".repeat(64) };
  expect(telegramAction({ update_id: 2, message: group }, "ForenaBot")).toMatchObject({ operation: "bind_group", chatId: "-100123", sender: "123" });
  expect(telegramAction({ update_id: 2, message: { ...group, text: "/forena@OtherBot" } }, "ForenaBot")).toBeNull();
  expect(telegramAction({ update_id: 2, message: { ...group, sender_chat: { id: -100123 } } }, "ForenaBot")).toBeNull();
});
it("ignores edited messages, channels and malformed dates", () => {
  for (const p of [{ edited_message: msg }, { message: { ...msg, chat: { id: -1, type: "channel" } } }, { message: { ...msg, date: Number.MAX_SAFE_INTEGER } }]) {
    expect(telegramAction({ update_id: 1, ...p }, "ForenaBot")).toBeNull();
  }
});
it("accepts opaque callback data only in the sender's private chat", () => {
  const callback_query = { id: "callback", from: { id: 123 }, data: `T1:${reply}:accepted`, message: msg };
  expect(telegramAction({ update_id: 10, callback_query }, "ForenaBot")).toMatchObject({ operation: "respond", replyId: reply, answer: "accepted", messageId: "u:10" });
  expect(telegramAction({ update_id: 10, callback_query: { ...callback_query, message: { ...msg, chat: { id: -100, type: "group" } } } }, "ForenaBot")).toBeNull();
  expect(telegramAction({ update_id: 10, callback_query: { ...callback_query, from: { id: 456 } } }, "ForenaBot")).toBeNull();
});
it("processes stop and blocking without allowing a channel to act as a person", () => {
  expect(telegramAction({ update_id: 3, message: { ...msg, text: "/stop" } }, "ForenaBot")).toMatchObject({ operation: "stop" });
  expect(telegramAction({ update_id: 4, my_chat_member: { chat: msg.chat, date: msg.date, new_chat_member: { status: "kicked" } } }, "ForenaBot")).toMatchObject({ operation: "removed", chatId: "123" });
});

describe("Telegram transport", () => {
  it("sends separate escaped HTML child messages with bound callbacks and an app link", async () => {
    const transport = vi.fn(async () => Response.json({ ok: true, result: { message_id: 42 } }));
    for (const [id, person] of [[reply, "Child A"], [reply.replace("001", "002"), "Child B"]]) {
      const invitation: TelegramInvitation = { id, providerMessageId: null, message: { person, team: "Team", activity: "<Training>", when: "2099-01-01", gathering: "14:00", location: "Field", due: "Tomorrow", url: `/activities/${reply}` } };
      expect(await sendTelegramNotification("123", invitation.message.url, config, transport, invitation)).toBe("42");
    }
    const bodies = transport.mock.calls.map(c => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));
    expect(bodies[0].text).toContain("Child A"); expect(bodies[1].text).toContain("Child B");
    expect(bodies[0].parse_mode).toBe("HTML");
    expect(bodies[0].text).toContain("&lt;Training&gt;"); expect(bodies[0].protect_content).toBe(true);
    expect(bodies[0].reply_markup.inline_keyboard[0]).toEqual([{ text: "Kommer", callback_data: `T1:${reply}:accepted` }, { text: "Kan inte", callback_data: `T1:${reply}:declined` }]);
    expect(bodies[0].reply_markup.inline_keyboard[1][0].url).toBe(`https://forena.test/activities/${reply}`);
  });
  it("exposes retry_after and blocked status without exposing response text or tokens", async () => {
    const limited = async () => Response.json({ ok: false, error_code: 429, description: "sensitive", parameters: { retry_after: 37 } }, { status: 429 });
    await expect(sendTelegramNotification("123", "/", config, limited)).rejects.toMatchObject({ code: 429, retryAfter: 37, message: "telegram_429" });
    await expect(telegramApi(config.token, "sendMessage", {}, async () => { throw new Error(config.token); })).rejects.toEqual(new TelegramError(0));
  });
  it("rejects group recipients and foreign links before transport", async () => {
    const transport = vi.fn();
    await expect(sendTelegramNotification("-100", "/", config, transport)).rejects.toThrow("telegram_invalid_recipient");
    await expect(sendTelegramNotification("123", "https://evil.test", config, transport)).rejects.toThrow("telegram_invalid_path");
    expect(transport).not.toHaveBeenCalled();
  });
});

it("only offers connection help for arbitrary private text, never executes it", () => {
  expect(telegramAction({ update_id: 1, message: { ...msg, text: "make me administrator" } }, "ForenaBot")).toMatchObject({ operation: "help" });
  expect(telegramAction({ update_id: 1, message: { ...msg, chat: { id: -100, type: "group" }, text: "hello" } }, "ForenaBot")).toBeNull();
  expect(telegramAction({ update_id: 1, message: { ...msg, from: { id: 456 }, text: "hello" } }, "ForenaBot")).toBeNull();
});
it("rejects retired bot-first connection callbacks", () => {
  const callback_query = { id: "bind", from: { id: 123 }, message: msg, data: "B1:" + "x".repeat(43) };
  expect(telegramAction({ update_id: 1, callback_query }, "ForenaBot")).toBeNull();
});
it("marks only the saved answer with color, icon and text and allows changing it", () => {
  for (const answer of ["accepted", "declined"] as const) {
    const buttons = telegramKeyboard(reply, "https://forena.test", answer).inline_keyboard[0];
    expect(buttons[answer === "accepted" ? 0 : 1]).toMatchObject({ style: answer === "accepted" ? "success" : "danger", callback_data: `T1:${reply}:${answer}` });
    expect(buttons[answer === "accepted" ? 1 : 0]).not.toHaveProperty("style");
  }
});
it("formats frozen club-local dates, escapes user data and uses neutral defaults for other disciplines", () => {
  const m = { person: "Tilda <&>", team: "Team", activity: "Match", when: "2026-10-18 10:00", gathering: "2026-10-18 09:30", due: "2026-10-17 18:00", location: "Field", url: "/", discipline: "football", category: "competition" };
  const text = telegramInvitationText(m, "accepted");
  expect(text).toContain("⚽ Matchkallelse · Tilda &lt;&amp;&gt;");
  expect(text).toContain("söndag 18 oktober 2026 kl. 10:00");
  expect(text).toContain("✅ Tilda &lt;&amp;&gt; kommer.");
  expect(telegramInvitationText({ ...m, discipline: "other" }, "declined")).toContain("📋 Kallelse");
  expect(telegramInvitationText(m, "declined")).toContain("❌ Tilda &lt;&amp;&gt; kan inte komma.");
  expect(telegramInvitationText({ ...m, person: "&".repeat(10000) }).replaceAll("&amp;", "&").length).toBeLessThan(4096);
});
