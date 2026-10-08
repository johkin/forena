import { packageForSection } from "./disciplines";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { resolveDisciplineDefaults, type DisciplineDefaultsRow, type DisciplineDefaultsPatch } from "./discipline-defaults";
export { normalizeDefaultsPatch } from "./discipline-defaults";

export async function loadDisciplineDefaults(supabase: SupabaseClient<Database>, organizationId: string, sectionId: string, teamId?: string) {
  const [sections, teams] = await Promise.all([
    supabase.from("section_discipline_defaults").select("*").eq("organization_id", organizationId).eq("section_id", sectionId),
    teamId ? supabase.from("team_discipline_defaults").select("*").eq("organization_id", organizationId).eq("team_id", teamId) : Promise.resolve({ data: [], error: null }),
  ]);
  if (sections.error || teams.error) throw new Error("Disciplinförvalen kunde inte hämtas.");
  return [
    ...(sections.data ?? []).map(row => ({ ...row, scope: "section" as const, scopeId: row.section_id })),
    ...(teams.data ?? []).map(row => ({ ...row, scope: "team" as const, scopeId: row.team_id })),
  ].map(row => ({ id: row.id, activityTypeId: row.activity_type_id, scope: row.scope,
    organizationId: row.organization_id, scopeId: row.scopeId, disciplineId: row.discipline_id,
    version: row.version, revision: row.revision, values: row.values as DisciplineDefaultsPatch })) satisfies DisciplineDefaultsRow[];
}
export async function loadActivityConfiguration(supabase: SupabaseClient<Database>, teamId: string) {
  const { data: team, error: teamError } = await supabase.from("teams").select("id, organization_id, section_id").eq("id", teamId).single();
  if (teamError || !team) throw new Error("Laget kunde inte hittas.");
  const [orgResult, sectionResult, typeResult, rows, catalogueResult] = await Promise.all([
    supabase.from("organizations").select("time_zone").eq("id", team.organization_id).single(),
    supabase.from("sections").select("discipline_id").eq("id", team.section_id).single(),
    supabase.from("activity_types").select("id, name, slug, system_category, organization_id, discipline_id, active").or(`organization_id.is.null,organization_id.eq.${team.organization_id}`).order("name"),
    loadDisciplineDefaults(supabase, team.organization_id, team.section_id, teamId),
    supabase.from("disciplines").select("id, key"),
  ]);
  if (catalogueResult.error || orgResult.error || sectionResult.error || typeResult.error) throw new Error("Aktivitetsinställningarna kunde inte hämtas.");
  const disciplineId = sectionResult.data?.discipline_id ?? null;
  const disciplineKey = catalogueResult.data?.find(d => d.id === disciplineId)?.key ?? null;
  const types = (typeResult.data ?? []).filter(type => type.active && (!type.discipline_id || type.discipline_id === disciplineId)).map(type => ({ ...type,
    defaults: resolveDisciplineDefaults({ activityTypeId: type.id, organizationId: team.organization_id,
      sectionId: team.section_id, teamId, disciplineId, disciplineKey, activityTypeSlug: type.slug, activityCategory: type.system_category }, rows),
  }));
  const disciplinePackage = packageForSection(disciplineId, disciplineId, catalogueResult.data ?? []);
  return { team, disciplineId, disciplineKey, disciplinePackage, timeZone: orgResult.data!.time_zone, types };
}
export type ActivityConfiguration = Awaited<ReturnType<typeof loadActivityConfiguration>>;
export async function requireActivityType(supabase: SupabaseClient<Database>, teamId: string, typeId?: string) {
  const config = await loadActivityConfiguration(supabase, teamId);
  const type = config.types.find(type => typeId ? type.id === typeId : type.slug === "ovrigt" && !type.organization_id);
  if (!type) throw new Error("Aktivitetstypen är inte tillgänglig för lagets disciplin.");
  return type;
}

export async function loadDefaultsDefinition(supabase: SupabaseClient<Database>, scope: "section" | "team", scopeId: string, activityTypeId: string) {
  let sectionId = scopeId;
  if (scope === "team") {
    const { data, error } = await supabase.from("teams").select("section_id").eq("id", scopeId).single();
    if (error || !data) throw new Error("Laget kunde inte läsas.");
    sectionId = data.section_id;
  }
  const [{ data: section, error: sectionError }, { data: type, error: typeError }] = await Promise.all([
    supabase.from("sections").select("discipline_id, organization_id").eq("id", sectionId).single(),
    supabase.from("activity_types").select("slug, system_category").eq("id", activityTypeId).single(),
  ]);
  if (sectionError || typeError || !section?.discipline_id || !type) throw new Error("Välj en disciplin på sektionen först.");
  const { data: discipline, error } = await supabase.from("disciplines").select("key").eq("id", section.discipline_id).single();
  if (error || !discipline) throw new Error("Disciplinen kunde inte läsas.");
  return { activityTypeId, organizationId: section.organization_id, sectionId,
    teamId: scope === "team" ? scopeId : "", disciplineId: section.discipline_id,
    disciplineKey: discipline.key, activityTypeSlug: type.slug, activityCategory: type.system_category };
}
