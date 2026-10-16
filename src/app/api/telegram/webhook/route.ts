import { createAdminClient } from "@/lib/supabase/admin";
import { telegramAction, verifyTelegramSecret, telegramAvailable } from "@/lib/telegram";
import { telegramApi, telegramKeyboard } from "../../../../../supabase/functions/_shared/telegram";
import { getSiteUrl } from "@/lib/site-url";

export async function POST(request: Request) {
  if (!telegramAvailable()) return new Response("Unavailable", { status: 503 });
  if (!verifyTelegramSecret(request.headers.get("x-telegram-bot-api-secret-token"), process.env.TELEGRAM_WEBHOOK_SECRET ?? "")) return new Response("Forbidden", { status: 403 });
  const reader = request.body?.getReader();
  if (!reader) return new Response("Bad request", { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 256_000) { await reader.cancel(); return new Response("Too large", { status: 413 }); }
    chunks.push(value);
  }
  let payload: unknown;
  try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return new Response("Bad request", { status: 400 }); }
  const action = telegramAction(payload, process.env.TELEGRAM_BOT_USERNAME!);
  if (!action) return new Response("OK");
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const supabase = createAdminClient();
  try {
    if (action.operation === "respond") {
      const { data, error } = await supabase.rpc("respond_telegram", {
        message_id: action.messageId, sender: action.sender, event_at: new Date().toISOString(), reply_id: action.replyId, answer: action.answer,
      });
      if (error) return new Response("Retry later", { status: 503 });
      const text = data === "accepted" ? "Kommer" : data === "declined" ? "Kan inte" : "Kallelsen är inte tillgänglig. Öppna Förena.";
      // A confirmation failure never rolls back a saved answer. No provider body
      // or fetch error (which can contain credentials) enters application logs.
      await telegramApi(token, "answerCallbackQuery", { callback_query_id: action.callbackId, text }).catch(() => {});
      if (data === "accepted" || data === "declined") {
        const { data: messages, error: lookupError } = await supabase.rpc("telegram_reply_message", { reply_id: action.replyId, sender: action.sender });
        const frozen = messages as { text: string; url: string } | null;
        if (!lookupError && frozen) await telegramApi(token, "editMessageText", {
          chat_id: action.chatId, message_id: Number(action.providerMessageId),
          text: `${frozen.text}\n\nDitt svar: ${text}.`,
          reply_markup: telegramKeyboard(action.replyId, new URL(frozen.url, getSiteUrl()).href),
          link_preview_options: { is_disabled: true },
        }).catch(() => {});
      }
    } else if (action.operation === "bind" || action.operation === "stop") {
      const { data, error } = await supabase.rpc("receive_telegram", {
        message_id: action.messageId, sender: action.sender, event_at: action.eventAt,
        operation: action.operation, pairing_hash: action.operation === "bind" ? action.pairingHash : undefined,
      });
      if (error) return new Response("Retry later", { status: 503 });
      if (data) await telegramApi(token, "sendMessage", { chat_id: action.chatId,
        text: action.operation === "bind" ? "Telegram är kopplat till Förena. Du får privata kallelser och kan svara med knapparna. /stop kopplar bort kontot." : "Telegram har kopplats bort från Förena." }).catch(() => {});
    } else if (action.operation === "removed") {
      const { error } = await supabase.rpc("remove_telegram_chat", { target_chat: action.chatId, event_at: action.eventAt });
      if (error) return new Response("Retry later", { status: 503 });
    } else if (action.operation === "bind_group") {
      // getChatMember is only guaranteed for other users when the bot is an admin.
      const member = await telegramApi<{ status: string }>(token, "getChatMember", { chat_id: action.chatId, user_id: Number(action.sender) });
      if (!["creator", "administrator"].includes(member.status)) return new Response("OK");
      const { data, error } = await supabase.rpc("bind_telegram_group", { pairing_hash: action.pairingHash, sender: action.sender, target_chat: action.chatId, event_at: action.eventAt });
      if (error) return new Response("Retry later", { status: 503 });
      if (data) await telegramApi(token, "sendMessage", { chat_id: action.chatId, text: "Gruppen är kopplad till Förena. Använd /forena för att öppna lagets vy. Personliga kallelser och svar skickas privat." }).catch(() => {});
    } else if (action.operation === "group") {
      const { data, error } = await supabase.rpc("telegram_group_link", { target_chat: action.chatId, sender: action.sender, message_id: action.messageId });
      if (error) return new Response("Retry later", { status: 503 });
      if (data) await telegramApi(token, "sendMessage", { chat_id: action.chatId, text: "Öppna lagets vy i Förena. Logga in för att se det du har behörighet till.",
        reply_markup: { inline_keyboard: [[{ text: "Öppna Förena", url: new URL(data, getSiteUrl()).href }]] } }).catch(() => {});
    } else {
      await telegramApi(token, "sendMessage", { chat_id: action.chatId, text: "Koppla Telegram i Min profil i Förena. Svara på privata kallelser med knapparna. /stop kopplar bort kontot. Gruppkoppling för lag och ledare görs i profilen." }).catch(() => {});
    }
  } catch {
    return new Response("Retry later", { status: 503 });
  }
  return new Response("OK");
}
