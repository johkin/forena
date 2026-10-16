import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const telegramPairingHash = (code: string) => createHash("sha256").update(code).digest("hex");
export function telegramAvailable() {
  return process.env.TELEGRAM_ENABLED === "true" && /^\d+:[A-Za-z0-9_-]+$/.test(process.env.TELEGRAM_BOT_TOKEN ?? "")
    && /^[A-Za-z0-9_]{5,32}$/.test(process.env.TELEGRAM_BOT_USERNAME ?? "")
    && /^[A-Za-z0-9_-]{32,256}$/.test(process.env.TELEGRAM_WEBHOOK_SECRET ?? "");
}
export function verifyTelegramSecret(value: string | null, secret: string) {
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret) || !/^[A-Za-z0-9_-]{32,256}$/.test(value ?? "") || value!.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(value!), Buffer.from(secret));
}

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const user = z.object({ id, is_bot: z.boolean().optional() });
const chat = z.object({ id: z.number().int().refine(n => Number.isSafeInteger(n) && n !== 0), type: z.enum(["private", "group", "supergroup"]) });
const timestamp = z.number().int().nonnegative().max(4_000_000_000);
const message = z.object({ message_id: id, date: timestamp, chat, from: user.optional(), text: z.string().max(4096).optional(), sender_chat: z.unknown().optional() });
const update = z.object({
  update_id: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  message: message.optional(),
  callback_query: z.object({ id: z.string().min(1).max(200), from: user, data: z.string().max(64).optional(), message: message.optional() }).optional(),
  my_chat_member: z.object({ chat, date: timestamp, new_chat_member: z.object({ status: z.string() }) }).optional(),
});

// Exact commands only. Never interpret chat text as app instructions or AI input.
export function telegramAction(payload: unknown, botUsername: string) {
  const parsed = update.safeParse(payload);
  if (!parsed.success) return null;
  const u = parsed.data;
  const envelope = { updateId: String(u.update_id), messageId: `u:${u.update_id}` };
  const member = u.my_chat_member;
  if (member && (member.new_chat_member.status === "kicked" || member.new_chat_member.status === "left")) {
    return { ...envelope, operation: "removed" as const, chatId: String(member.chat.id), eventAt: new Date(member.date * 1000).toISOString() };
  }
  const q = u.callback_query;
  if (q) {
    const m = q.message;
    const reply = /^T1:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}):(accepted|declined)$/.exec(q.data ?? "");
    const bind = /^B1:([A-Za-z0-9_-]{43})$/.exec(q.data ?? "");
    if (bind && m && m.chat.type === "private" && m.chat.id === q.from.id && !q.from.is_bot) {
      return { ...envelope, operation: "bind" as const, sender: String(q.from.id), chatId: String(m.chat.id),
        eventAt: new Date().toISOString(), pairingHash: telegramPairingHash(bind[1]), callbackId: q.id };
    }
    if (!reply || !m || m.chat.type !== "private" || m.chat.id !== q.from.id || q.from.is_bot) return null;
    return { ...envelope, operation: "respond" as const, sender: String(q.from.id), chatId: String(m.chat.id),
      callbackId: q.id, providerMessageId: String(m.message_id), originalText: m.text ?? "Kallelse",
      replyId: reply[1], answer: reply[2] as "accepted" | "declined" };
  }
  const m = u.message;
  if (!m?.from || m.from.is_bot || m.sender_chat || !m.text) return null;
  const command = /^\/(start|stop|help|forena)(?:@([A-Za-z0-9_]+))?(?: ([a-f0-9]{64}))?$/.exec(m.text.trim());
  if (!command && m.chat.type === "private" && m.chat.id === m.from.id && !m.text.trim().startsWith("/")) {
    return { ...envelope, operation: "help" as const, sender: String(m.from.id), chatId: String(m.chat.id), eventAt: new Date(m.date * 1000).toISOString() };
  }
  if (!command || (command[2] && command[2].toLowerCase() !== botUsername.toLowerCase())) return null;
  const common = { ...envelope, sender: String(m.from.id), chatId: String(m.chat.id), eventAt: new Date(m.date * 1000).toISOString() };
  if (m.chat.type === "private") {
    if (m.chat.id !== m.from.id) return null;
    if (command[1] === "start" && command[3]) return { ...common, operation: "bind" as const, pairingHash: telegramPairingHash(command[3]) };
    if (command[1] === "stop" && !command[3]) return { ...common, operation: "stop" as const };
    return { ...common, operation: "help" as const };
  }
  if (m.chat.id >= 0) return null;
  if (command[1] === "start" && command[3]) return { ...common, operation: "bind_group" as const, pairingHash: telegramPairingHash(command[3]) };
  if (["forena", "help"].includes(command[1]) && !command[3]) return { ...common, operation: "group" as const };
  return null;
}
