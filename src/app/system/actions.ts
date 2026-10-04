"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { sendPlatformAdminInvitationEmail } from "@/lib/email/platform-admin-invitation";
import { getSiteUrl } from "@/lib/site-url";
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
  const { data, error } = await supabase.from("disciplines").update({ name, category, updated_at: new Date().toISOString() }).eq("id", id).select("id").maybeSingle();
  if (error || !data) redirect("/system/disciplines?error=Disciplinen+kunde+inte+uppdateras");
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
  const { data, error } = await supabase.from("assistant_memories").update({ content, updated_at: new Date().toISOString() }).eq("id", id).eq("scope", "system").select("id").maybeSingle();
  if (error || !data) redirect("/system/memories?error=Minnet+kunde+inte+uppdateras");
  revalidatePath("/system/memories");
  redirect("/system/memories?saved=1");
}

export async function deleteSystemMemory(formData: FormData) {
  const { supabase } = await requireSystemAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/system/memories?error=Ogiltigt+minne");
  const { data, error } = await supabase.from("assistant_memories").delete().eq("id", id).eq("scope", "system").select("id").maybeSingle();
  if (error || !data) redirect("/system/memories?error=Minnet+kunde+inte+tas+bort");
  revalidatePath("/system/memories");
  redirect("/system/memories?deleted=1");
}


export async function inviteSystemAdmin(formData: FormData) {
  const { supabase, user } = await requireSystemAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@") || email.length > 320) {
    redirect("/system/administrators?error=Ange+en+giltig+e-postadress");
  }

  const { data: admins, error: adminsError } = await supabase.rpc("list_platform_admins");
  if (adminsError) {
    console.error("[system-admin] could not list platform admins", { message: adminsError.message });
    redirect("/system/administrators?error=Administratörerna+kunde+inte+kontrolleras");
  }
  if ((admins ?? []).some((admin) => admin.email?.toLowerCase() === email)) {
    redirect("/system/administrators?error=Användaren+är+redan+systemadministratör");
  }

  const now = new Date().toISOString();
  await supabase
    .from("platform_admin_invites")
    .update({ status: "expired" })
    .eq("email", email)
    .eq("status", "pending")
    .lte("expires_at", now);

  // A new send gets a new one-time token. This also provides an explicit
  // "resend" behaviour without ever storing the plaintext token.
  await supabase
    .from("platform_admin_invites")
    .update({ status: "cancelled" })
    .eq("email", email)
    .eq("status", "pending");

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data: invite, error: inviteError } = await supabase
    .from("platform_admin_invites")
    .insert({
      email,
      token_hash: tokenHash,
      source: "system_admin",
      invited_by: user.id,
      status: "pending",
    })
    .select("id")
    .single();

  if (inviteError || !invite) {
    console.error("[system-admin] invite insert failed", { message: inviteError?.message });
    redirect("/system/administrators?error=Inbjudan+kunde+inte+skapas");
  }

  const requestHeaders = await headers();
  const origin = getSiteUrl(requestHeaders.get("origin") ?? undefined);
  const invitationUrl = `${origin}/system-admin-invite/${encodeURIComponent(token)}`;

  try {
    await sendPlatformAdminInvitationEmail({
      to: email,
      invitationUrl,
      invitationId: invite.id,
    });
  } catch (error) {
    await supabase
      .from("platform_admin_invites")
      .update({ status: "failed" })
      .eq("id", invite.id)
      .eq("status", "pending");
    console.error("[system-admin] invite email failed", {
      message: error instanceof Error ? error.message : String(error),
      inviteId: invite.id,
    });
    redirect("/system/administrators?error=Inbjudan+skapades+men+e-posten+kunde+inte+skickas");
  }

  const { error: sentError } = await supabase
    .from("platform_admin_invites")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", invite.id)
    .eq("status", "pending");

  if (sentError) {
    console.error("[system-admin] invite sent timestamp failed", { message: sentError.message, inviteId: invite.id });
  }

  revalidatePath("/system/administrators");
  redirect(`/system/administrators?invited=${encodeURIComponent(email)}`);
}

export async function cancelSystemAdminInvite(formData: FormData) {
  const { supabase } = await requireSystemAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/system/administrators?error=Ogiltig+inbjudan");

  const { data, error } = await supabase
    .from("platform_admin_invites")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", "pending").select("id").maybeSingle();

  if (error || !data) {
    console.error("[system-admin] invite cancellation failed", { message: error?.message ?? "No pending invitation changed", inviteId: id });
    redirect("/system/administrators?error=Inbjudan+kunde+inte+avbrytas");
  }

  revalidatePath("/system/administrators");
  redirect("/system/administrators?cancelled=1");
}
