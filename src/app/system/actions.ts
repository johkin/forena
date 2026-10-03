"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function requireSystemAdmin() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/system");
  const { data: allowed } = await supabase.rpc("has_platform_role", { allowed_roles: ["system_admin"] });
  if (!allowed) redirect("/");
  return { supabase, user: auth.user };
}

export async function createDiscipline(formData: FormData) {
  const { supabase } = await requireSystemAdmin();
  const key = String(formData.get("key") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) || !name || name.length > 120) redirect("/system/disciplines?error=Ogiltig+disciplin");
  const { error } = await supabase.from("disciplines").insert({ key, name, category });
  if (error) redirect("/system/disciplines?error=Disciplinen+kunde+inte+sparas");
  revalidatePath("/system/disciplines");
  redirect("/system/disciplines?saved=1");
}

export async function updateDiscipline(formData: FormData) {
  const { supabase } = await requireSystemAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || null;
  if (!id || !name || name.length > 120) redirect("/system/disciplines?error=Ogiltig+disciplin");
  const { error } = await supabase.from("disciplines").update({ name, category, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) redirect("/system/disciplines?error=Disciplinen+kunde+inte+uppdateras");
  revalidatePath("/system/disciplines");
  redirect("/system/disciplines?saved=1");
}

export async function createSystemMemory(formData: FormData) {
  const { supabase, user } = await requireSystemAdmin();
  const disciplineId = String(formData.get("disciplineId") ?? "") || null;
  const kind = String(formData.get("kind") ?? "instruction");
  const subject = String(formData.get("subject") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!["fact", "preference", "instruction", "convention"].includes(kind) || !subject || !content || subject.length > 80 || content.length > 1200) redirect("/system/memories?error=Ogiltigt+minne");
  const { error } = await supabase.from("assistant_memories").insert({
    organization_id: null, scope: "system", scope_id: null, discipline_id: disciplineId,
    kind: kind as "fact" | "preference" | "instruction" | "convention", subject, content, created_by: user.id,
  });
  if (error) redirect("/system/memories?error=Minnet+kunde+inte+sparas");
  revalidatePath("/system/memories");
  redirect("/system/memories?saved=1");
}

export async function updateSystemMemory(formData: FormData) {
  const { supabase } = await requireSystemAdmin();
  const id = String(formData.get("id") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  if (!id || !content || content.length > 1200) redirect("/system/memories?error=Ogiltigt+minne");
  const { error } = await supabase.from("assistant_memories").update({ content, updated_at: new Date().toISOString() }).eq("id", id).eq("scope", "system");
  if (error) redirect("/system/memories?error=Minnet+kunde+inte+uppdateras");
  revalidatePath("/system/memories");
  redirect("/system/memories?saved=1");
}

export async function deleteSystemMemory(formData: FormData) {
  const { supabase } = await requireSystemAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) await supabase.from("assistant_memories").delete().eq("id", id).eq("scope", "system");
  revalidatePath("/system/memories");
  redirect("/system/memories?deleted=1");
}
