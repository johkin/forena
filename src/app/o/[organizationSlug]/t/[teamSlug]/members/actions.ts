"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updatePlayer(formData: FormData) {
  const organizationSlug = String(formData.get("organizationSlug") ?? "");
  const teamSlug = String(formData.get("teamSlug") ?? "");
  const personId = String(formData.get("personId") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const destination = `/o/${organizationSlug}/t/${teamSlug}/members`;

  if (!personId || !displayName || (email && !email.includes("@"))) {
    redirect(`${destination}?error=${encodeURIComponent("Kontrollera namn och e-postadress")}`);
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect(`/login?next=${encodeURIComponent(destination)}`);

  const { data: organization } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", organizationSlug)
    .maybeSingle();
  const { data: team } = organization ? await supabase
    .from("teams")
    .select("id, organization_id")
    .eq("organization_id", organization.id)
    .eq("slug", teamSlug)
    .maybeSingle() : { data: null };
  if (!team) redirect(`${destination}?error=${encodeURIComponent("Laget kunde inte hittas")}`);

  const { data: canManage } = await supabase.rpc("can_manage_team", { target_team_id: team.id });
  if (!canManage) redirect(`${destination}?error=${encodeURIComponent("Du saknar behörighet att ändra spelare")}`);

  const { data: membership } = await supabase
    .from("memberships")
    .select("person_id")
    .eq("team_id", team.id)
    .eq("person_id", personId)
    .eq("role", "participant")
    .is("ends_on", null)
    .maybeSingle();
  if (!membership) redirect(`${destination}?error=${encodeURIComponent("Spelaren tillhör inte laget")}`);

  const { error: personError } = await supabase.from("people").update({ display_name: displayName }).eq("id", personId);
  if (personError) redirect(`${destination}?error=${encodeURIComponent("Spelarens namn kunde inte sparas")}`);

  const emailResult = email
    ? await supabase.from("person_login_emails").upsert({ person_id: personId, organization_id: team.organization_id, email }, { onConflict: "person_id" })
    : await supabase.from("person_login_emails").delete().eq("person_id", personId);

  if (emailResult.error) {
    const message = emailResult.error.code === "23505" ? "E-postadressen används redan av en annan spelare" : "E-postadressen kunde inte sparas";
    redirect(`${destination}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(destination);
  revalidatePath(`/o/${organizationSlug}/t/${teamSlug}`);
  redirect(`${destination}?saved=${encodeURIComponent(displayName)}`);
}
