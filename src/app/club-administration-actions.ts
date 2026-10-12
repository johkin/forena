"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { clubAddressSchema, clubMetadataSchema, clubMutationError, clubSectionSchema, clubSlug, clubStructureSchema, parseClubSetup, type ClubSetupState } from "@/lib/club-administration";

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
  const system = form.get("administrationScope") === "system";
  if (system) {
    const { data, error } = await supabase.rpc("has_platform_role", { allowed_roles: ["system_admin"] });
    if (error || data !== true) redirect("/");
  }
  const id = z.guid().safeParse(form.get("organizationId"));
  if (!id.success) redirect(`${system ? "/system/organizations" : "/"}?error=invalid-club-id`);
  const target = id.data;
  const { data, error } = await supabase.rpc("club_structure", { target });
  if (error) redirect("/");
  const structure = clubStructureSchema.parse(data);
  const path = system ? `/system/organizations/${target}` : `/o/${structure.organization.slug}/admin/sections`;
  return { supabase, target, path, slug: structure.organization.slug };
}
function sectionId(value: FormDataEntryValue | null, path: string) {
  const id = z.guid().safeParse(value);
  if (!id.success) redirect(`${path}?error=${encodeURIComponent("Sektionen kunde inte identifieras. Uppdatera sidan och välj sektionen igen.")}`);
  return id.data;
}
function finish(path: string, slug: string, error: { code?: string; message?: string } | null, deleted = false): never {
  if (error) redirect(`${path}?error=${encodeURIComponent(clubMutationError(error))}`);
  revalidatePath(path); revalidatePath("/system/organizations"); revalidatePath(`/o/${slug}`, "layout"); revalidatePath("/");
  redirect(`${path}?${deleted ? "deleted" : "saved"}=1`);
}
export async function checkClubSlug(value: string, organizationId?: string): Promise<"available" | "taken" | "error"> {
  const parsed = clubAddressSchema.safeParse(value);
  if (!parsed.success || (organizationId !== undefined && !z.guid().safeParse(organizationId).success)) return "error";
  const supabase = await actor();
  const { data, error } = await supabase.rpc("club_slug_available", { requested_slug: parsed.data, target: organizationId ?? null });
  return error || typeof data !== "boolean" ? "error" : data ? "available" : "taken";
}

export async function saveClub(form: FormData) {
  const { supabase, target, path, slug } = await context(form);
  const input = clubMetadataSchema.safeParse({ name: form.get("name"), slug: form.get("slug"), assistantName: form.get("assistantName"), timeZone: form.get("timeZone") });
  if (!input.success) redirect(`${path}?error=Kontrollera+klubbens+uppgifter`);
  const { error } = await supabase.rpc("save_club_metadata", { target, input: input.data });
  if (!error) revalidatePath(`/o/${input.data.slug}`, "layout");
  const destination = path.startsWith("/system/") ? path : `/o/${input.data.slug}/admin/sections`;
  finish(error ? path : destination, slug, error);
}
export async function saveSection(form: FormData) {
  const { supabase, target, path, slug } = await context(form);
  const name = String(form.get("name") ?? "");
  const targetSection = form.get("sectionId") ? sectionId(form.get("sectionId"), path) : null;
  const input = clubSectionSchema.safeParse({ name, slug: targetSection ? form.get("slug") : clubSlug(name), disciplineId: form.get("disciplineId") });
  if (!input.success) redirect(`${path}?error=Kontrollera+sektionens+namn+och+disciplin`);
  const { error } = await supabase.rpc("save_club_section", { target, section_id: targetSection, input: input.data }); finish(path, slug, error);
}
export async function deleteSection(form: FormData) {
  const { supabase, target, path, slug } = await context(form);
  const targetSection = sectionId(form.get("sectionId"), path);
  const { error } = await supabase.rpc("delete_club_section", { target, section_id: targetSection }); finish(path, slug, error, true);
}
