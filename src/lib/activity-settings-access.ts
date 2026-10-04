import { createClient } from "./supabase/server";
import { redirect } from "next/navigation";
import { isUuid } from "./ai/assistant-memory-draft";
import type { ActivityDefaultsScope } from "./activity-defaults";

export async function activitySettingsAccess(slug: string | null, scope: ActivityDefaultsScope, scopeId: string | null) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: organization } = slug ? await supabase.from("organizations").select("id, slug, name, assistant_name, time_zone, discipline_id").eq("slug", slug).single() : { data: null };
  if (slug && !organization) throw new Error("Föreningen kunde inte hittas.");
  if (scope !== "system" && (!organization || !isUuid(scopeId))) throw new Error("Ogiltigt mål.");
  if ((scope === "system") !== (slug === null)) throw new Error("Systemadministration hanteras separat.");
  const { data: allowed, error } = await supabase.rpc("can_manage_activity_defaults", { target_scope: scope, target_organization_id: organization?.id ?? null, target_scope_id: scopeId });
  if (error || !allowed) throw new Error("Du saknar behörighet att ändra dessa aktivitetsinställningar.");
  return { supabase, organization, user: auth.user };
}
