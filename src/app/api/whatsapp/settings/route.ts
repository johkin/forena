import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { pairingHash, whatsAppAvailable } from "@/lib/whatsapp";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  const supabase = await createClient();
  if (!(await supabase.auth.getUser()).data.user) return json({ error: "Inloggning krävs." }, 401);
  const { data, error } = await supabase.rpc("whatsapp_settings", { operation: "status" });
  if (error) return json({ error: "WhatsApp-inställningen kunde inte hämtas." }, 503);
  return json({ ...(data as object), available: whatsAppAvailable() });
}

export async function POST(request: Request) {
  // Cookie-authenticated mutations must originate in this app.
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Otillåten begäran." }, 403);
  const supabase = await createClient();
  if (!(await supabase.auth.getUser()).data.user) return json({ error: "Inloggning krävs." }, 401);
  const body = await request.json().catch(() => null);
  if (body?.operation !== "start" && body?.operation !== "disable") return json({ error: "Ogiltig åtgärd." }, 400);
  if (body.operation === "start" && (!whatsAppAvailable() || body.consent !== true)) return json({ error: "WhatsApp kräver samtycke och måste vara konfigurerat." }, 400);
  const code = body.operation === "start" ? randomBytes(32).toString("hex") : null;
  const { data, error } = await supabase.rpc("whatsapp_settings", { operation: body.operation, pairing_hash: code ? pairingHash(code) : undefined });
  if (error) return json({ error: error.code === "54000" ? "Vänta en stund innan du försöker igen." : "WhatsApp-inställningen kunde inte sparas." }, error.code === "54000" ? 429 : 400);
  return json({ ...(data as object), available: whatsAppAvailable(), ...(code ? {
    pairingUrl: `https://wa.me/${process.env.WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(`FORENA ${code}`)}`,
    expiresInMinutes: 10,
  } : {}) });
}
