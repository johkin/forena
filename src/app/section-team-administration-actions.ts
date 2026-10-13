"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { clubSlug } from "@/lib/club-administration";
import { sectionTeamInputSchema, sectionTeamMutationError, sectionTeamStructureSchema } from "@/lib/section-team-administration";

async function context(form: FormData) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) redirect("/login");
  const ids = z.object({ target: z.guid(), section_id: z.guid() }).safeParse({ target: form.get("organizationId"), section_id: form.get("sectionId") });
  if (!ids.success) redirect(`/?error=${encodeURIComponent("Sektionen kunde inte identifieras. Öppna dess administration igen.")}`);
  const { data, error } = await supabase.rpc("section_team_structure", ids.data);
  if (error) redirect(`/?error=${encodeURIComponent(sectionTeamMutationError(error))}`);
  const structure = sectionTeamStructureSchema.parse(data);
  const path = `/o/${structure.organization.slug}/s/${structure.section.slug}/admin/teams`;
  return { supabase, ids: ids.data, structure, path };
}
function teamId(value: FormDataEntryValue | null, path: string) {
  const id = z.guid().safeParse(value);
  if (!id.success) redirect(`${path}?error=${encodeURIComponent("Laget kunde inte identifieras. Uppdatera sidan och välj laget igen.")}`);
  return id.data;
}
function finish(structure: SectionTeamStructureForRefresh, path: string, error: { code?: string; message?: string } | null, result: "saved" | "created" | "deleted"): never {
  if (error) redirect(`${path}?error=${encodeURIComponent(sectionTeamMutationError(error))}`);
  revalidatePath(`/o/${structure.organization.slug}`, "layout");
  revalidatePath(`/system/organizations/${structure.organization.id}`);
  revalidatePath("/");
  redirect(`${path}?${result}=1`);
}
type SectionTeamStructureForRefresh = { organization: { id: string; slug: string } };

export async function saveSectionTeam(form: FormData) {
  const { supabase, ids, structure, path } = await context(form);
  const targetTeam = form.get("teamId") ? teamId(form.get("teamId"), path) : null;
  const existing = targetTeam ? structure.teams.find(team => team.id === targetTeam) : undefined;
  if (targetTeam && !existing) redirect(`${path}?error=${encodeURIComponent("Laget kunde inte hittas i sektionen. Uppdatera sidan.")}`);
  const name = String(form.get("name") ?? "");
  // Existing addresses come from the server, never the submitted form.
  const input = sectionTeamInputSchema.safeParse({ name, slug: existing?.slug ?? clubSlug(name), season: String(form.get("season") ?? "") });
  if (!input.success) redirect(`${path}?error=${encodeURIComponent("Ange ett lagnamn (högst 120 tecken) och en säsong på högst 40 tecken. Namnet behöver innehålla bokstäver eller siffror för lagets adress.")}`);
  const { error } = await supabase.rpc("save_section_team", { ...ids, team_id: targetTeam, input: input.data });
  finish(structure, path, error, targetTeam ? "saved" : "created");
}
export async function deleteSectionTeam(form: FormData) {
  const { supabase, ids, structure, path } = await context(form);
  const targetTeam = teamId(form.get("teamId"), path);
  const { error } = await supabase.rpc("delete_section_team", { ...ids, team_id: targetTeam });
  finish(structure, path, error, "deleted");
}
