import { createAdminClient } from "@/lib/supabase/admin";
import { telegramAction, verifyTelegramSecret, telegramAvailable } from "@/lib/telegram";
import { TelegramError, telegramApi, telegramKeyboard, telegramInvitationText, telegramConfirmation, type TelegramInvitationMessage } from "../../../../../supabase/functions/_shared/telegram";
import { getSiteUrl } from "@/lib/site-url";
import { answerTelegramQuestion, telegramAssistantEnabled } from "@/lib/telegram-assistant";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  if (action.operation === "question" && telegramAssistantEnabled()) {
    try {
      const answer = await answerTelegramQuestion(action);
      if (answer) await telegramApi(token, "sendMessage", { chat_id: action.chatId, text: answer,
        protect_content: true, link_preview_options: { is_disabled: true },
        reply_markup: { inline_keyboard: [[{ text: "Öppna Förena", url: getSiteUrl() }]] },
      }).catch(() => {});
      return new Response("OK");
    } catch { return new Response("Retry later", { status: 503 }); }
  }
  if (action.operation === "help" || action.operation === "question") {
    if (Date.now() - Date.parse(action.eventAt) > 600_000 || Date.parse(action.eventAt) > Date.now()) return new Response("OK");
    const url = new URL("/profile#telegram", getSiteUrl());
    await telegramApi(token, "sendMessage", { chat_id: action.chatId,
      text: "Välkommen till Förena! Öppna Min profil, logga in och välj Aktivera Telegram. Telegram öppnas direkt på din egen enhet. Tryck Start i din privata chatt med boten för att slutföra kopplingen. Dela inte kopplingslänken. Är du redan kopplad behöver du inte göra något. /stop kopplar bort kontot." + (telegramAssistantEnabled() ? " Ställ frågor här privat med vanlig text, till exempel: När är nästa träning för F2016? Ange lagets namn om du har flera lag. Varje fråga är fristående; ange lag, aktivitet och period igen vid behov." : ""),
      protect_content: true, link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: [[{ text: "Koppla till Förena", url: url.href }]] },
    }).catch(() => {});
    return new Response("OK");
  }
  const supabase = createAdminClient();
  try {
    if (action.operation === "respond") {
      const { data, error } = await supabase.rpc("respond_telegram", {
        message_id: action.messageId, sender: action.sender, event_at: new Date().toISOString(), reply_id: action.replyId, answer: action.answer,
      });
      if (error) return new Response("Retry later", { status: 503 });
      const answer = data === "accepted" || data === "declined" ? data : null;
      type FrozenMessage = { text: string; url: string; message?: TelegramInvitationMessage };
      let frozen: FrozenMessage | null = null;
      if (answer) {
        const lookup = await supabase.rpc("telegram_reply_message", { reply_id: action.replyId, sender: action.sender });
        if (!lookup.error) frozen = lookup.data as FrozenMessage | null;
      }
      const confirmation = answer ? frozen?.message ? telegramConfirmation(frozen.message.person, answer) : `Ditt svar: ${answer === "accepted" ? "Kommer" : "Kan inte"}.` : "Kallelsen är inte tillgänglig. Öppna Förena.";
      // Confirmation failures never roll back a saved answer.
      await telegramApi(token, "answerCallbackQuery", { callback_query_id: action.callbackId, text: confirmation }).catch(() => {});
      if (answer && frozen) await telegramApi(token, "editMessageText", {
        chat_id: action.chatId, message_id: Number(action.providerMessageId),
        text: frozen.message ? telegramInvitationText(frozen.message, answer) : `${frozen.text}\n\n${confirmation}`,
        ...(frozen.message ? { parse_mode: "HTML" } : {}),
        reply_markup: telegramKeyboard(action.replyId, new URL(frozen.url, getSiteUrl()).href, answer),
        link_preview_options: { is_disabled: true },
      }).catch(() => {});
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
      let status: string;
      try {
        status = (await telegramApi<{ status: string }>(token, "getChatMember", { chat_id: action.chatId, user_id: Number(action.sender) })).status;
      } catch (error) {
        // These errors cannot be repaired by redelivering the same group update.
        if (error instanceof TelegramError && (error.code === 400 || error.code === 403)) return new Response("OK");
        throw error;
      }
      if (!["creator", "administrator"].includes(status)) return new Response("OK");
      const { data, error } = await supabase.rpc("bind_telegram_group", { pairing_hash: action.pairingHash, sender: action.sender, target_chat: action.chatId, event_at: action.eventAt });
      if (error) return new Response("Retry later", { status: 503 });
      if (data) await telegramApi(token, "sendMessage", { chat_id: action.chatId, text: "Gruppen är kopplad till Förena. Använd /forena för att öppna lagets vy. Personliga kallelser och svar skickas privat." }).catch(() => {});
    } else if (action.operation === "group") {
      const { data, error } = await supabase.rpc("telegram_group_link", { target_chat: action.chatId, sender: action.sender, message_id: action.messageId });
      if (error) return new Response("Retry later", { status: 503 });
      if (data) await telegramApi(token, "sendMessage", { chat_id: action.chatId, text: "Öppna lagets vy i Förena. Logga in för att se det du har behörighet till.",
        reply_markup: { inline_keyboard: [[{ text: "Öppna Förena", url: new URL(data, getSiteUrl()).href }]] } }).catch(() => {});
    }
  } catch {
    return new Response("Retry later", { status: 503 });
  }
  return new Response("OK");
}
