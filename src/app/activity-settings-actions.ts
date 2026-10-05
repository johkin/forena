"use server";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { activitySettingsAccess } from "@/lib/activity-settings-access";
import { normalizeDefaultsPatch } from "@/lib/activity-configuration";
import type { ActivityDefaultsScope } from "@/lib/activity-defaults";
import { isUuid } from "@/lib/ai/assistant-memory-draft";

function target(form: FormData) {
  const slug = String(form.get("organizationSlug") ?? "") || null;
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Ogiltig förening.");
  const scope = String(form.get("scope"));
  if (!["system","organization","section","team"].includes(scope)) throw new Error("Ogiltig nivå.");
  const scopeId = String(form.get("scopeId") ?? "") || null;
  const path = slug ? `/o/${slug}/activity-settings` : "/system/activity-types";
  const query = new URLSearchParams({ scope, ...(scopeId ? { scopeId } : {}) });
  return { slug, scope: scope as ActivityDefaultsScope, scopeId, path, query };
}
export async function saveActivityDefaults(form: FormData) {
  const t = target(form);
  t.query.set("typeId",String(form.get("activityTypeId") ?? ""));
  let errorMessage: string | undefined;
  try {
    const { supabase, organization } = await activitySettingsAccess(t.slug, t.scope, t.scopeId);
    const typeId = String(form.get("activityTypeId"));
    const revision = Number(form.get("revision"));
    if (!isUuid(typeId) || !Number.isSafeInteger(revision) || revision < 0) throw new Error("Ogiltiga standardvärden.");
    const patch = normalizeDefaultsPatch(JSON.parse(String(form.get("values") ?? "{}")));
    const { error } = await supabase.rpc("save_activity_defaults", { target_type_id: typeId, target_scope: t.scope, target_organization_id: organization?.id ?? null, target_scope_id: t.scopeId, expected_revision: revision, patch });
    if (error) throw new Error(error.code === "40001" ? "Inställningarna har ändrats. Ladda om sidan och försök igen." : "Standardvärdena kunde inte sparas.");
  } catch (error) { unstable_rethrow(error); errorMessage = error instanceof Error ? error.message : "Standardvärdena kunde inte sparas."; }
  t.query.set(errorMessage ? "error" : "saved", errorMessage ?? "1");
  revalidatePath(t.path);
  redirect(`${t.path}?${t.query}`);
}
export async function saveActivityType(form: FormData) {
  const { supabase } = await activitySettingsAccess(null, "system", null);
  const id = String(form.get("id") ?? "") || null;
  const slug = String(form.get("slug") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  const category = String(form.get("system_category"));
  const disciplineId = String(form.get("discipline_id") ?? "") || null;
  if ((id && !isUuid(id)) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80 || !name || name.length > 80 || (disciplineId && !isUuid(disciplineId)) || !["session","competition","work","meeting","education","other"].includes(category)) redirect("/system/activity-types?error=Ogiltig+aktivitetstyp");
  const values = { name, slug, system_category: category as "session", discipline_id: disciplineId, active: form.get("active") === "on" };
  const result = id ? await supabase.from("activity_types").update(values).eq("id", id).is("organization_id", null).select("id").maybeSingle() : await supabase.from("activity_types").insert({ ...values, organization_id: null }).select("id").single();
  if (result.error || !result.data) redirect("/system/activity-types?error=Aktivitetstypen+kunde+inte+sparas");
  revalidatePath("/system/activity-types");
  redirect("/system/activity-types?saved=1");
}
export async function saveTargetDiscipline(form: FormData) {
  let t: ReturnType<typeof target> | undefined;
  let errorMessage: string | undefined;
  try {
    t = target(form);
    const { supabase, organization } = await activitySettingsAccess(t.slug, t.scope, t.scopeId);
    const disciplineId = String(form.get("discipline_id") ?? "") || null;
    if (disciplineId && !isUuid(disciplineId)) throw new Error("Ogiltig disciplin.");
    if (t.scope === "system" || !organization || !t.scopeId) throw new Error("Ogiltigt mål.");
    const { error } = await supabase.rpc("set_activity_discipline", { target_scope: t.scope, target_organization_id: organization.id, target_scope_id: t.scopeId, target_discipline_id: disciplineId });
    if (error) throw new Error("Disciplinen kunde inte sparas.");
  } catch (error) {
    unstable_rethrow(error);
    errorMessage = error instanceof Error ? error.message : "Disciplinen kunde inte sparas.";
  }
  const path = t?.path ?? "/";
  const query = t?.query ?? new URLSearchParams();
  query.set(errorMessage ? "error" : "saved", errorMessage ?? "1");
  revalidatePath(path);
  redirect(`${path}?${query}`);
}
