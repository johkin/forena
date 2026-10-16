import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function pairingHash(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export function verifyWhatsAppSignature(body: string, signature: string | null, secret: string) {
  if (!secret || !/^sha256=[a-f0-9]{64}$/.test(signature ?? "")) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature!.slice(7), "hex"));
}

type IncomingAction = { messageId: string; sender: string; eventAt: string } & (
  { operation: "bind" | "stop"; pairingHash: string | null }
  | { operation: "respond"; replyId: string; answer: "accepted" | "declined" }
);

// Only exact commands are processed; arbitrary messages never invoke AI or
// application commands. Ignore messages for other business phone numbers.
export function whatsAppActions(payload: unknown, phoneNumberId: string): IncomingAction[] {
  const result: IncomingAction[] = [];
  if (!payload || typeof payload !== "object") return result;
  const root = payload as { object?: unknown; entry?: unknown };
  if (root.object !== "whatsapp_business_account" || !Array.isArray(root.entry)) return result;
  for (const entry of root.entry) {
    if (!entry || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      const value = change?.value;
      if (change?.field !== "messages" || value?.metadata?.phone_number_id !== phoneNumberId || !Array.isArray(value.messages)) continue;
      for (const message of value.messages) {
        if (typeof message?.from !== "string" || !/^[1-9]\d{6,14}$/.test(message.from)
          || typeof message.id !== "string" || !message.id || message.id.length > 200
          || typeof message.timestamp !== "string" || !/^\d{10}$/.test(message.timestamp)) continue;
        const envelope = { messageId: message.id, sender: message.from, eventAt: new Date(Number(message.timestamp) * 1000).toISOString() };
        const buttonPayload = message.type === "button" ? message.button?.payload
          : message.type === "interactive" && message.interactive?.type === "button_reply" ? message.interactive.button_reply?.id : null;
        const reply = typeof buttonPayload === "string" ? /^F1:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}):(accepted|declined)$/.exec(buttonPayload) : null;
        if (reply) {
          result.push({ ...envelope, operation: "respond", replyId: reply[1], answer: reply[2] as "accepted" | "declined" });
          continue;
        }
        if (message.type !== "text" || typeof message.text?.body !== "string") continue;
        const text = message.text.body.trim();
        const code = /^FORENA ([a-f0-9]{64})$/.exec(text)?.[1];
        const stop = /^(STOP|STOPP|AVREGISTRERA)$/i.test(text);
        if (code || stop) result.push({ ...envelope,
          operation: code ? "bind" : "stop", pairingHash: code ? pairingHash(code) : null });
      }
    }
  }
  return result;
}

export async function sendWhatsAppResponseConfirmation(sender: string, result: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const version = process.env.WHATSAPP_API_VERSION?.trim();
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !/^v\d+\.\d+$/.test(version ?? "") || !/^\d+$/.test(phoneId ?? "")) throw new Error("whatsapp_confirmation_not_configured");
  const text = result === "accepted" ? "Ditt svar har sparats: Kommer. Du kan ändra svaret med knapparna i kallelsen. Kommentarer skriver du i Förena."
    : result === "declined" ? "Ditt svar har sparats: Kan inte. Du kan ändra svaret med knapparna i kallelsen. Kommentarer skriver du i Förena."
    : "Svaret kunde inte sparas. Kallelsen kan ha ändrats eller svarstiden gått ut. Öppna Förena för aktuella uppgifter.";
  const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ messaging_product: "whatsapp", to: sender, type: "text", text: { body: text } }),
  });
  if (!response.ok) throw new Error("whatsapp_confirmation_failed");
}

export function whatsAppAvailable() {
  return process.env.WHATSAPP_ENABLED === "true"
    && /^[1-9]\d{6,14}$/.test(process.env.WHATSAPP_BUSINESS_NUMBER ?? "")
    && /^\d+$/.test(process.env.WHATSAPP_PHONE_NUMBER_ID ?? "")
    && !!process.env.WHATSAPP_APP_SECRET?.trim() && !!process.env.WHATSAPP_VERIFY_TOKEN?.trim();
}
