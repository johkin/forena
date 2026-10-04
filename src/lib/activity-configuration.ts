import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { resolveActivityDefaults, FALLBACK_ACTIVITY_DEFAULTS, type ActivityDefaultsRow, type ActivityDefaultsPatch } from "./activity-defaults";
import { normalizeActivityTimingRules } from "./activity-time-rules";

export function normalizeDefaultsPatch(value: unknown): ActivityDefaultsPatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Ogiltiga standardvärden.");
  const patch = value as Record<string, unknown>;
  const fields = Object.keys(FALLBACK_ACTIVITY_DEFAULTS);
  if (Object.keys(patch).some(key => !fields.includes(key))) throw new Error("Okänt standardfält.");
  const present = Object.fromEntries(Object.entries(patch).filter(([, item]) => item !== null && item !== undefined));
  normalizeActivityTimingRules({ ...FALLBACK_ACTIVITY_DEFAULTS, ...present });
  return patch as ActivityDefaultsPatch;
}

export async function loadActivityConfiguration(supabase: SupabaseClient<Database>, teamId: string) {
  const { data: team, error: teamError } = await supabase.from("teams").select("id, organization_id, section_id, discipline_id").eq("id", teamId).single();
  if (teamError || !team) throw new Error("Laget kunde inte hittas.");
  const [orgResult, sectionResult, typeResult, defaultsResult] = await Promise.all([
    supabase.from("organizations").select("discipline_id, time_zone").eq("id", team.organization_id).single(),
    supabase.from("sections").select("discipline_id").eq("id", team.section_id).single(),
    supabase.from("activity_types").select("id, name, slug, system_category, organization_id, discipline_id, active").or(`organization_id.is.null,organization_id.eq.${team.organization_id}`).order("name"),
    supabase.from("activity_defaults").select("id, activity_type_id, scope, organization_id, scope_id, revision, values").or(`organization_id.is.null,organization_id.eq.${team.organization_id}`),
  ]);
  if (orgResult.error || sectionResult.error || typeResult.error || defaultsResult.error) throw new Error("Aktivitetsinställningarna kunde inte hämtas.");
  const disciplineId = team.discipline_id ?? sectionResult.data?.discipline_id ?? orgResult.data?.discipline_id ?? null;
  const rows: ActivityDefaultsRow[] = (defaultsResult.data ?? []).map(row => ({ id: row.id, activityTypeId: row.activity_type_id, scope: row.scope, organizationId: row.organization_id, scopeId: row.scope_id, revision: row.revision, values: normalizeDefaultsPatch(row.values) }));
  const types = (typeResult.data ?? []).filter(type => type.active && (!type.discipline_id || type.discipline_id === disciplineId)).map(type => ({ ...type, defaults: resolveActivityDefaults({ activityTypeId: type.id, organizationId: team.organization_id, sectionId: team.section_id, teamId }, rows) }));
  return { team, disciplineId, timeZone: orgResult.data!.time_zone, types };
}
export type ActivityConfiguration = Awaited<ReturnType<typeof loadActivityConfiguration>>;
export async function requireActivityType(supabase: SupabaseClient<Database>, teamId: string, typeId?: string) {
  const config = await loadActivityConfiguration(supabase, teamId);
  const type = config.types.find(type => typeId ? type.id === typeId : type.slug === "ovrigt" && !type.organization_id);
  if (!type) throw new Error("Aktivitetstypen är inte tillgänglig för lagets disciplin.");
  return type;
}
