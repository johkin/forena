"use server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { clubAdminError, clubAdminInvitationPath } from "@/lib/club-administrators";
import { sendClubAdminInvitationEmail } from "@/lib/email/club-admin-invitation";
import { getSiteUrl } from "@/lib/site-url";

async function context(form: FormData) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) redirect("/login?next=/system/organizations");
  const { data, error } = await supabase.rpc("has_platform_role", { allowed_roles: ["system_admin"] });
  if (error || data !== true) redirect("/");
  const target = z.guid().safeParse(form.get("organizationId"));
  if (!target.success) redirect("/system/organizations?error=invalid-club-id");
  return { supabase, target: target.data, path: `/system/organizations/${target.data}` };
}
function finish(path: string, error: { code?: string; message?: string } | null, message = "Administratörerna har uppdaterats."): never {
  if (error) redirect(`${path}?error=${encodeURIComponent(clubAdminError(error))}`);
  revalidatePath(path); revalidatePath("/", "layout");
  redirect(`${path}?adminMessage=${encodeURIComponent(message)}`);
}
export async function becomeClubAdministrator(form: FormData) {
  const { supabase, target, path } = await context(form);
  const { error } = await supabase.rpc("system_club_admins", { target, operation: "self" });
  finish(path, error, "Du är nu klubbadministratör.");
}
export async function removeClubAdministrator(form: FormData) {
  const { supabase, target, path } = await context(form);
  const userId = z.guid().safeParse(form.get("userId"));
  if (!userId.success) redirect(`${path}?error=Ogiltig+administratör`);
  const { error } = await supabase.rpc("system_club_admins", { target, operation: "remove", payload: { userId: userId.data } });
  finish(path, error, "Administratörsrollen har tagits bort. Klubbmedlemskapet finns kvar.");
}
export async function cancelClubAdministratorInvitation(form: FormData) {
  const { supabase, target, path } = await context(form);
  const id = z.guid().safeParse(form.get("invitationId"));
  if (!id.success) redirect(`${path}?error=Ogiltig+inbjudan`);
  const { error } = await supabase.rpc("system_club_admins", { target, operation: "cancel", payload: { invitationId: id.data } });
  finish(path, error, "Inbjudan har avbrutits.");
}
export async function inviteClubAdministrator(form: FormData) {
  const { supabase, target, path } = await context(form);
  const email = z.email().max(254).safeParse(String(form.get("email") ?? "").trim().toLowerCase());
  if (!email.success) redirect(`${path}?error=Ange+en+giltig+e-postadress`);
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await supabase.rpc("system_club_admins", { target, operation: "invite", payload: { email: email.data, tokenHash: createHash("sha256").update(token).digest("hex") } });
  if (error) finish(path, error);
  const invitation = z.object({ invitationId: z.guid(), clubName: z.string() }).safeParse(data);
  if (!invitation.success) redirect(`${path}?error=Inbjudan+kunde+inte+förberedas`);
  try {
    await sendClubAdminInvitationEmail({ to: email.data, invitationId: invitation.data.invitationId, clubName: invitation.data.clubName, invitationUrl: `${getSiteUrl()}${clubAdminInvitationPath(token)}` });
  } catch {
    const { error: failureError } = await supabase.rpc("system_club_admins", { target, operation: "delivery", payload: { invitationId: invitation.data.invitationId, sent: false } });
    if (failureError) console.error("[club-admin-invite] delivery failure status could not be recorded", { code: failureError.code });
    revalidatePath(path);
    redirect(`${path}?error=${encodeURIComponent("Mejlet kunde inte skickas. Länken är inaktiv. Uppdatera sidan och försök skicka igen.")}`);
  }
  const { error: deliveryError } = await supabase.rpc("system_club_admins", { target, operation: "delivery", payload: { invitationId: invitation.data.invitationId, sent: true } });
  if (deliveryError) {
    revalidatePath(path);
    redirect(`${path}?error=${encodeURIComponent("Mejlet skickades men inbjudan kunde inte aktiveras. Länken är inaktiv. Uppdatera sidan och skicka en ny inbjudan.")}`);
  }
  finish(path, null, `Inbjudan skickades till ${email.data}.`);
}
