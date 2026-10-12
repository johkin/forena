"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { clubMetadataSchema, clubMutationError, clubSectionSchema, clubSlug, clubStructureSchema, parseClubSetup, type ClubSetupState } from "@/lib/club-administration";

async function actor() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login?next=/setup");
  return supabase;
}
async function create(form: FormData, managed: boolean): Promise<ClubSetupState> {
  const supabase = await actor();
  if (managed) {
    const { data, error } = await supabase.rpc("has_platform_role", { allowed_roles: ["system_admin"] });
    if (error || data !== true) return { error: "Du saknar behörighet att skapa klubbar i systemadministrationen." };
  }
  let input;
  try { input = parseClubSetup(form); } catch { return { error: "Kontrollera klubb, sektion, disciplin och eventuellt lag." }; }
  const { data, error } = await supabase.rpc("create_club_workspace", { input, managed });
  if (error) return { error: clubMutationError(error) };
  const result = z.object({ id: z.guid(), slug: z.string(), teamSlug: z.string().nullable() }).safeParse(data);
  if (!result.success) return { error: "Klubben skapades men kunde inte visas. Uppdatera klubböversikten." };
  revalidatePath("/"); revalidatePath("/system/organizations");
  redirect(managed ? `/system/organizations/${result.data.id}?created=1` : result.data.teamSlug ? `/o/${result.data.slug}/t/${result.data.teamSlug}` : `/o/${result.data.slug}/admin/sections?created=1`);
}
export async function createManagedClub(_state: ClubSetupState, form: FormData) { return create(form, true); }
export async function createOwnClub(_state: ClubSetupState, form: FormData) { return create(form, false); }

async function context(form: FormData) {
  const supabase = await actor();
  const target = z.guid().parse(form.get("organizationId"));
  const system = form.get("administrationScope") === "system";
  if (system) {
    const { data, error } = await supabase.rpc("has_platform_role", { allowed_roles: ["system_admin"] });
    if (error || data !== true) redirect("/");
  }
  const { data, error } = await supabase.rpc("club_structure", { target });
  if (error) redirect("/");
  const structure = clubStructureSchema.parse(data);
  const path = system ? `/system/organizations/${target}` : `/o/${structure.organization.slug}/admin/sections`;
  return { supabase, target, path, slug: structure.organization.slug };
}
function finish(path: string, slug: string, error: { code?: string; message?: string } | null, deleted = false): never {
  if (error) redirect(`${path}?error=${encodeURIComponent(clubMutationError(error))}`);
  revalidatePath(path); revalidatePath("/system/organizations"); revalidatePath(`/o/${slug}`, "layout"); revalidatePath("/");
  redirect(`${path}?${deleted ? "deleted" : "saved"}=1`);
}
export async function saveClub(form: FormData) {
  const { supabase, target, path, slug } = await context(form);
  const input = clubMetadataSchema.safeParse({ name: form.get("name"), assistantName: form.get("assistantName"), timeZone: form.get("timeZone") });
  if (!input.success) redirect(`${path}?error=Kontrollera+klubbens+uppgifter`);
  const { error } = await supabase.rpc("save_club_metadata", { target, input: input.data }); finish(path, slug, error);
}
export async function saveSection(form: FormData) {
  const { supabase, target, path, slug } = await context(form);
  const name = String(form.get("name") ?? "");
  const sectionId = form.get("sectionId") ? z.guid().parse(form.get("sectionId")) : null;
  const input = clubSectionSchema.safeParse({ name, slug: sectionId ? form.get("slug") : clubSlug(name), disciplineId: form.get("disciplineId") });
  if (!input.success) redirect(`${path}?error=Kontrollera+sektionens+namn+och+disciplin`);
  const { error } = await supabase.rpc("save_club_section", { target, section_id: sectionId, input: input.data }); finish(path, slug, error);
}
export async function deleteSection(form: FormData) {
  const { supabase, target, path, slug } = await context(form);
  const sectionId = z.guid().parse(form.get("sectionId"));
  const { error } = await supabase.rpc("delete_club_section", { target, section_id: sectionId }); finish(path, slug, error, true);
}
