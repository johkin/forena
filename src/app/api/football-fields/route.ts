import { z } from "zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { footballSchemas } from "@/lib/disciplines/football";
import type { Json } from "@/lib/supabase/database.types";

const target = z.object({
  teamId: z.uuid(), scope: z.enum(["team", "teamMembership", "activity", "activityParticipation"]),
  activityId: z.uuid().optional(), personId: z.uuid().optional(),
});
const change = target.extend({ values: z.unknown(), revision: z.number().int().min(0), captainSource: z.enum(["teamPlayers", "acceptedActivityPlayers"]) });
const headers = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

async function handle(request: Request, save: boolean) {
  const raw = save ? await request.json().catch(() => null) : Object.fromEntries(new URL(request.url).searchParams);
  const parsed = target.safeParse(raw);
  const mutation = save ? change.safeParse(raw) : null;
  if (!parsed.success || (mutation && !mutation.success)) return json({ error: "Ogiltiga fotbollsuppgifter." }, 400);
  const input = parsed.data;
  const changeInput = mutation?.success ? mutation.data : undefined;
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return json({ error: "Logga in för att se uppgifterna." }, 401);
  let values: Json | undefined;
  if (changeInput) {
    const validated = footballSchemas[input.scope].safeParse(changeInput.values);
    if (!validated.success) return json({ error: "Kontrollera fälten och försök igen." }, 400);
    values = validated.data as Json;
  }
  const { data, error } = await supabase.rpc("football_fields", {
    target_team_id: input.teamId, target_scope: input.scope,
    target_activity_id: input.activityId ?? null, target_person_id: input.personId ?? null,
    ...(changeInput ? { new_values: values!, expected_revision: changeInput.revision, selected_source: changeInput.captainSource } : {}),
  });
  if (error) {
    const messages: Record<string, [number, string]> = {
      "42501": [403, "Du saknar behörighet att hantera uppgifterna."],
      P0002: [404, "Laget, spelaren eller aktiviteten kunde inte hittas."],
      "40001": [409, "Uppgifterna har ändrats. Läs in senaste värden och försök igen."],
      "55000": [409, "Aktiviteten kan inte redigeras."],
      "22023": [400, "Kontrollera matchuppgifterna och att vald spelare fortfarande är valbar."],
    };
    const [status, message] = messages[error.code] ?? [500, "Fotbollsuppgifterna kunde inte hämtas eller sparas."];
    return json({ error: message }, status);
  }
  return json(data);
}
export async function GET(request: Request) { return handle(request, false); }
export async function PUT(request: Request) { return handle(request, true); }
