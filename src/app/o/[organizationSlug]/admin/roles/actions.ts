"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function assignGuardianAccess(formData: FormData) {
  const slug = String(formData.get("organizationSlug") ?? "");
  const destination = `/o/${encodeURIComponent(slug)}/admin/roles`;
  const teamId = String(formData.get("teamId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const responsibility = String(formData.get("responsibility") ?? "");
  const accessProfile = String(formData.get("accessProfile") ?? "");
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
    || !teamId
    || !userId
    || !["lagledare", "tranare"].includes(responsibility)
    || !["team_admin", "team_editor", "attendance_manager", "team_viewer"].includes(accessProfile)
  ) {
    redirect(`${destination}?error=${encodeURIComponent("Välj målsman, lag, ansvar och behörighet")}`);
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect(`/login?next=${encodeURIComponent(destination)}`);
  const { data: organization } = await supabase.from("organizations").select("id").eq("slug", slug).maybeSingle();
  if (!organization) redirect(`${destination}?error=${encodeURIComponent("Föreningen kunde inte hittas")}`);

  const { error } = await supabase.rpc("assign_existing_guardian_team_access", {
    target_organization_id: organization.id,
    target_team_id: teamId,
    target_user_id: userId,
    target_responsibility_slug: responsibility,
    target_access_profile_key: accessProfile,
  });
  if (error) redirect(`${destination}?error=${encodeURIComponent("Ansvar och behörighet kunde inte tilldelas. Kontrollera din behörighet och att målsmannen hör till föreningen.")}`);
  redirect(`${destination}?saved=1`);
}
