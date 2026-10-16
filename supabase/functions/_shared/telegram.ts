export type TelegramInvitation = {
  id: string;
  message: { person: string; team: string; activity: string; when: string; location: string; gathering: string; due: string; url: string };
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

export function telegramKeyboard(id: string, url: string) {
  return { inline_keyboard: [
    [{ text: "Kommer", callback_data: `T1:${id}:accepted` }, { text: "Kan inte", callback_data: `T1:${id}:declined` }],
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
  const text = m ? `Kallelse för ${m.person}\nLag: ${m.team}\nAktivitet: ${m.activity}\nNär: ${m.when}\nPlats: ${m.location}\nSamling: ${m.gathering}\nSvara senast: ${m.due}`.slice(0, 3500)
    : "Du har ny information i Förena.";
  const result = await telegramApi<{ message_id: number }>(config.token, "sendMessage", {
    chat_id: recipient, text, protect_content: true, link_preview_options: { is_disabled: true },
    reply_markup: invitation ? telegramKeyboard(invitation.id, url) : { inline_keyboard: [[{ text: "Öppna Förena", url }]] },
  }, transport);
  if (!Number.isSafeInteger(result?.message_id)) throw new Error("telegram_missing_message_id");
  return String(result.message_id);
}
