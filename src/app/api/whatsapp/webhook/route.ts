import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppResponseConfirmation, verifyWhatsAppSignature, whatsAppActions } from "@/lib/whatsapp";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (!token || url.searchParams.get("hub.mode") !== "subscribe" || url.searchParams.get("hub.verify_token") !== token) return new Response("Forbidden", { status: 403 });
  const challenge = url.searchParams.get("hub.challenge");
  return challenge && /^\d{1,100}$/.test(challenge) ? new Response(challenge, { headers: { "Cache-Control": "no-store" } }) : new Response("Bad request", { status: 400 });
}

export async function POST(request: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!secret || !phoneNumberId) return new Response("Unavailable", { status: 503 });
  // Bound memory usage even when Content-Length is absent or inaccurate.
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
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!verifyWhatsAppSignature(raw, request.headers.get("x-hub-signature-256"), secret)) return new Response("Forbidden", { status: 403 });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return new Response("Bad request", { status: 400 }); }
  const actions = whatsAppActions(payload, phoneNumberId);
  if (!actions.length) return new Response("OK");
  const supabase = createAdminClient();
  for (const action of actions) {
    if (action.operation === "respond") {
      const { data: result, error } = await supabase.rpc("respond_whatsapp", {
        message_id: action.messageId, sender: action.sender, event_at: action.eventAt,
        reply_id: action.replyId, answer: action.answer,
      });
      if (error) {
        console.error("whatsapp.response_failed", { code: error.code });
        return new Response("Retry later", { status: 503 });
      }
      // A button press is an incoming message and opens the service window.
      // Duplicate webhooks return null, so they cannot repeat a confirmation.
      if (result) {
        try { await sendWhatsAppResponseConfirmation(action.sender, result); }
        catch { console.warn("whatsapp.confirmation_failed"); }
      }
      continue;
    }
    const { error } = await supabase.rpc("receive_whatsapp", {
      message_id: action.messageId, sender: action.sender, event_at: action.eventAt,
      operation: action.operation, pairing_hash: action.pairingHash ?? undefined,
    });
    if (error) {
      console.error("whatsapp.webhook_failed", { code: error.code });
      return new Response("Retry later", { status: 503 });
    }
  }
  return new Response("OK");
}
