import { z } from "zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDisciplineRegistration } from "@/lib/disciplines";
import type { Json } from "@/lib/supabase/database.types";

const target = z.object({
  disciplineKey: z.string().max(80).optional(), teamId: z.uuid(), scope: z.enum(["team", "teamMembership", "activity", "activityParticipation"]),
  activityId: z.uuid().optional(), personId: z.uuid().optional(),
});
const change = target.extend({ values: z.unknown(), revision: z.number().int().min(0) });
const headers = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

function rpcError(code: string) {
    const messages: Record<string, [number, string]> = {
      "42501": [403, "Du saknar behörighet att hantera uppgifterna."],
      P0002: [404, "Laget, spelaren eller aktiviteten kunde inte hittas."],
      "40001": [409, "Uppgifterna har ändrats. Läs in senaste värden och försök igen."],
      "55000": [409, "Aktiviteten kan inte redigeras."],
      "22023": [400, "Kontrollera uppgifterna och att vald spelare fortfarande är valbar."],
    };
    const [status, message] = messages[code] ?? [500, "Disciplinuppgifterna kunde inte hämtas eller sparas."];
    return json({ error: message }, status);
}

async function handle(request: Request, save: boolean) {
  const raw = save ? await request.json().catch(() => null) : Object.fromEntries(new URL(request.url).searchParams);
  const parsed = target.safeParse(raw);
  const mutation = save ? change.safeParse(raw) : null;
  if (!parsed.success || (mutation && !mutation.success)) return json({ error: "Ogiltiga disciplinuppgifter." }, 400);
  const input = parsed.data;
  const changeInput = mutation?.success ? mutation.data : undefined;
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return json({ error: "Logga in för att se uppgifterna." }, 401);
  // Resolve the package through the authorized RPC, never a client-supplied catalogue UUID.
  const targetArgs = { target_team_id: input.teamId, target_scope: input.scope,
    target_activity_id: input.activityId ?? null, target_person_id: input.personId ?? null };
  let values: Json | undefined;
  let resolvedKey: string | undefined;
  if (changeInput) {
    const { data: current,error } = await supabase.rpc("discipline_fields",targetArgs);
    if (error) return rpcError(error.code);
    const resolved=current as {enabled?:boolean;disciplineKey?:string;version?:string}|null;
    const registration=resolved?.disciplineKey ? getDisciplineRegistration(resolved.disciplineKey,resolved.version) : null;
    if (!resolved?.enabled || !registration || (input.disciplineKey && input.disciplineKey!==resolved.disciplineKey)) return json({error:"Disciplinen har ändrats. Läs in uppgifterna igen."},409);
    const validated = registration.schemas[input.scope].safeParse(changeInput.values);
    if (!validated.success) return json({ error: "Kontrollera fälten och försök igen." }, 400);
    resolvedKey=resolved!.disciplineKey;
    values = validated.data as Json;
  }
  const { data, error } = await supabase.rpc("discipline_fields", {
    target_team_id: input.teamId, target_scope: input.scope,
    target_activity_id: input.activityId ?? null, target_person_id: input.personId ?? null,
    ...(changeInput ? { new_values: values!, expected_revision: changeInput.revision, expected_discipline_key: resolvedKey } : {}),
  });
  if (error) {
    return rpcError(error.code);
  }
  const result=data as {disciplineKey?:string;enabled?:boolean}|null;
  if (input.disciplineKey && result?.enabled && result.disciplineKey!==input.disciplineKey) return json({error:"Disciplinen har ändrats. Läs in uppgifterna igen."},409);
  return json(data);
}
export async function GET(request: Request) { return handle(request, false); }
export async function PUT(request: Request) { return handle(request, true); }
