export type TelegramInvitationMessage = {
  person: string; team: string; activity: string; when: string; location: string;
  gathering: string; due: string; url: string;
  discipline?: string; category?: string; activityType?: string;
};
export type TelegramAnswer = "accepted" | "declined";

const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const field = (value: string) => escapeHtml(value.slice(0, 200));

// These timestamps were frozen in the club's time zone. Do not reinterpret them
// in the worker's or the recipient's time zone.
function localDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) return field(value);
  const date = new Date(value.replace(" ", "T") + ":00Z");
  if (!Number.isFinite(date.getTime())) return field(value);
  return new Intl.DateTimeFormat("sv-SE", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(date);
}

export function telegramConfirmation(person: string, answer: TelegramAnswer) {
  return `${person.slice(0, 120)} ${answer === "accepted" ? "kommer" : "kan inte komma"}.`;
}

export function telegramInvitationText(m: TelegramInvitationMessage, answer?: TelegramAnswer) {
  const icon = m.discipline === "football" ? "⚽" : "📋";
  const heading = m.discipline === "football" && m.category === "competition" ? "Matchkallelse" : "Kallelse";
  return [
    `<b>${icon} ${heading} · ${field(m.person)}</b>`,
    `${field(m.team)}\n<b>${field(m.activity)}</b>`,
    `📅 ${localDate(m.when)}\n📍 ${field(m.location)}\n⏰ Samling: ${localDate(m.gathering)}`,
    answer ? `<b>${answer === "accepted" ? "✅" : "❌"} ${escapeHtml(telegramConfirmation(m.person, answer))}</b>` : `Kan ${field(m.person)} vara med?`,
    `Svara senast: ${localDate(m.due)}`,
  ].join("\n\n");
}

export type TelegramInvitation = {
  id: string;
  message: TelegramInvitationMessage;
  providerMessageId: string | null;
};

export class TelegramError extends Error {
  constructor(public code: number, public retryAfter = 0) { super(`telegram_${code}`); }
}

// Do not propagate fetch errors: their URLs can contain the bot token.
export async function telegramApi<T>(token: string, method: string, body: object, transport: typeof fetch = fetch): Promise<T> {
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) throw new Error("telegram_not_configured");
  let response: Response;
  try {
    response = await transport(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
    });
  } catch { throw new TelegramError(0); }
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok !== true) {
    throw new TelegramError(Number(data?.error_code) || response.status,
      Math.min(86400, Math.max(1, Number(data?.parameters?.retry_after) || 1)));
  }
  return data.result as T;
}

export function telegramKeyboard(id: string, url: string, answer?: TelegramAnswer) {
  return { inline_keyboard: [
    [{ text: answer === "accepted" ? "✅ Kommer" : "Kommer", callback_data: `T1:${id}:accepted`, ...(answer === "accepted" ? { style: "success" } : {}) },
      { text: answer === "declined" ? "❌ Kan inte" : "Kan inte", callback_data: `T1:${id}:declined`, ...(answer === "declined" ? { style: "danger" } : {}) }],
    [{ text: "Öppna Förena", url }],
  ] };
}

export async function sendTelegramNotification(
  recipient: string, path: string, config: { token: string; siteUrl: string },
  transport: typeof fetch = fetch, invitation?: TelegramInvitation,
) {
  if (!/^[1-9]\d{0,15}$/.test(recipient)) throw new Error("telegram_invalid_recipient");
  if (path !== "/" && !/^\/activities\/[a-f0-9-]{36}$/i.test(path)) throw new Error("telegram_invalid_path");
  const origin = new URL(config.siteUrl);
  if (origin.protocol !== "https:" || origin.username || origin.password) throw new Error("telegram_invalid_origin");
  const url = new URL(path, origin.origin).href;
  const m = invitation?.message;
  const text = m ? telegramInvitationText(m)
    : "Du har ny information i Förena.";
  const result = await telegramApi<{ message_id: number }>(config.token, "sendMessage", {
    chat_id: recipient, text, ...(m ? { parse_mode: "HTML" } : {}), protect_content: true, link_preview_options: { is_disabled: true },
    reply_markup: invitation ? telegramKeyboard(invitation.id, url) : { inline_keyboard: [[{ text: "Öppna Förena", url }]] },
  }, transport);
  if (!Number.isSafeInteger(result?.message_id)) throw new Error("telegram_missing_message_id");
  return String(result.message_id);
}
