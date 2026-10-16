import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { telegramAvailable, telegramPairingHash } from "@/lib/telegram";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET() {
  const supabase = await createClient();
  if (!(await supabase.auth.getUser()).data.user) return json({ error: "Inloggning krävs." }, 401);
  const { data, error } = await supabase.rpc("telegram_group_settings", { operation: "status" });
  return error ? json({ error: "Grupperna kunde inte hämtas." }, 503) : json({ ...(data as object), available: telegramAvailable() });
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Otillåten begäran." }, 403);
  const supabase = await createClient();
  if (!(await supabase.auth.getUser()).data.user) return json({ error: "Inloggning krävs." }, 401);
  const body = await request.json().catch(() => null);
  if (!body || !["start", "disable"].includes(body.operation) || !["team", "leaders"].includes(body.kind)
    || typeof body.teamId !== "string" || !/^[a-f0-9-]{36}$/i.test(body.teamId)) return json({ error: "Ogiltigt lag eller chattval." }, 400);
  if (body.operation === "start" && (!telegramAvailable() || body.consent !== true)) return json({ error: "Telegram kräver samtycke och måste vara konfigurerat." }, 400);
  const code = body.operation === "start" ? randomBytes(32).toString("hex") : undefined;
  const { data, error } = await supabase.rpc("telegram_group_settings", { operation: body.operation, target_team_id: body.teamId, chat_kind: body.kind, pairing_hash: code ? telegramPairingHash(code) : undefined });
  if (error) return json({ error: error.code === "54000" ? "Vänta en stund innan du försöker igen." : "Gruppen kunde inte kopplas. Kontrollera lagbehörigheten och koppla din privata chatt först." }, error.code === "54000" ? 429 : 400);
  return json({ ...(data as object), available: telegramAvailable(), ...(code ? { pairingUrl: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?startgroup=${code}` } : {}) });
}
