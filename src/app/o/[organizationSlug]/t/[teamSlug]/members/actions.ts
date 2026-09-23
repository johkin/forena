"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

function memberDestination(organizationSlug: string, teamSlug: string) {
  return `/o/${organizationSlug}/t/${teamSlug}/members`;
}

async function getManagedPlayer(formData: FormData) {
  const organizationSlug = String(formData.get("organizationSlug") ?? "");
  const teamSlug = String(formData.get("teamSlug") ?? "");
  const personId = String(formData.get("personId") ?? "");
  const destination = memberDestination(organizationSlug, teamSlug);
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect(`/login?next=${encodeURIComponent(destination)}`);

  const { data: organization } = await supabase.from("organizations").select("id").eq("slug", organizationSlug).maybeSingle();
  const { data: team } = organization ? await supabase.from("teams").select("id, organization_id").eq("organization_id", organization.id).eq("slug", teamSlug).maybeSingle() : { data: null };
  if (!team) redirect(`${destination}?error=${encodeURIComponent("Laget kunde inte hittas")}`);
  const { data: canManage } = await supabase.rpc("can_manage_team", { target_team_id: team.id });
  if (!canManage) redirect(`${destination}?error=${encodeURIComponent("Du saknar behörighet att ändra spelare")}`);
  const { data: membership } = await supabase.from("memberships").select("person_id").eq("team_id", team.id).eq("person_id", personId).eq("role", "participant").is("ends_on", null).maybeSingle();
  if (!membership) redirect(`${destination}?error=${encodeURIComponent("Spelaren tillhör inte laget")}`);
  const { data: person } = await supabase.from("people").select("user_id").eq("id", personId).maybeSingle();
  if (!person) redirect(`${destination}?error=${encodeURIComponent("Spelaren kunde inte hittas")}`);

  return { supabase, team, personId, linkedUserId: person.user_id, organizationSlug, teamSlug, destination };
}

async function sendLoginInvitation(email: string, organizationSlug: string, teamSlug: string) {
  const requestHeaders = await headers();
  const origin = getSiteUrl(requestHeaders.get("origin") ?? undefined);
  const teamPath = `/o/${organizationSlug}/t/${teamSlug}`;
  const passkeyPath = `/passkey/setup?next=${encodeURIComponent(teamPath)}`;
  const supabase = await createClient();
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(passkeyPath)}`, shouldCreateUser: true },
  });
}

export async function updatePlayer(formData: FormData) {
  const organizationSlug = String(formData.get("organizationSlug") ?? "");
  const teamSlug = String(formData.get("teamSlug") ?? "");
  const personId = String(formData.get("personId") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const destination = memberDestination(organizationSlug, teamSlug);

  if (!personId || !displayName || (email && !email.includes("@"))) {
    redirect(`${destination}?error=${encodeURIComponent("Kontrollera namn och e-postadress")}`);
  }

  const { supabase, team, linkedUserId } = await getManagedPlayer(formData);
  const { data: previousLogin } = await supabase.from("person_login_emails").select("email").eq("person_id", personId).maybeSingle();
  if (linkedUserId && previousLogin?.email !== email) {
    redirect(`${destination}?error=${encodeURIComponent("E-postadressen kan inte bytas efter att kontot har aktiverats")}`);
  }

  const { error: personError } = await supabase.from("people").update({ display_name: displayName }).eq("id", personId);
  if (personError) redirect(`${destination}?error=${encodeURIComponent("Spelarens namn kunde inte sparas")}`);

  const emailResult = email
    ? await supabase.from("person_login_emails").upsert({ person_id: personId, organization_id: team.organization_id, email }, { onConflict: "person_id" })
    : await supabase.from("person_login_emails").delete().eq("person_id", personId);

  if (emailResult.error) {
    const message = emailResult.error.code === "23505" ? "E-postadressen används redan av en annan spelare" : "E-postadressen kunde inte sparas";
    redirect(`${destination}?error=${encodeURIComponent(message)}`);
  }

  if (email && previousLogin?.email !== email) {
    const { error: invitationError } = await sendLoginInvitation(email, organizationSlug, teamSlug);
    if (invitationError) {
      console.error("[player-invitation] email failed", { message: invitationError.message, personId });
      redirect(`${destination}?saved=${encodeURIComponent(displayName)}&error=${encodeURIComponent("Uppgifterna sparades, men inbjudan kunde inte skickas. Försök med Skicka igen.")}`);
    }
    revalidatePath(destination);
    redirect(`${destination}?invited=${encodeURIComponent(displayName)}`);
  }

  revalidatePath(destination);
  revalidatePath(`/o/${organizationSlug}/t/${teamSlug}`);
  redirect(`${destination}?saved=${encodeURIComponent(displayName)}`);
}

export async function sendPlayerInvitation(formData: FormData) {
  const displayName = String(formData.get("displayName") ?? "Spelaren").trim();
  const { supabase, personId, organizationSlug, teamSlug, destination } = await getManagedPlayer(formData);
  const { data: login } = await supabase.from("person_login_emails").select("email").eq("person_id", personId).maybeSingle();
  if (!login?.email) redirect(`${destination}?error=${encodeURIComponent("Spara e-postadressen innan du skickar inbjudan")}`);

  const { error } = await sendLoginInvitation(login.email, organizationSlug, teamSlug);
  if (error) {
    console.error("[player-invitation] resend failed", { message: error.message });
    redirect(`${destination}?error=${encodeURIComponent("Inbjudan kunde inte skickas just nu. Försök igen om en stund.")}`);
  }
  redirect(`${destination}?invited=${encodeURIComponent(displayName)}`);
}
