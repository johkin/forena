"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function assignGuardianRole(formData: FormData) {
  const slug = String(formData.get("organizationSlug") ?? "");
  const destination = `/o/${encodeURIComponent(slug)}/admin/roles`;
  const teamId = String(formData.get("teamId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !teamId || !userId || !["team_manager", "coach"].includes(role)) {
    redirect(`${destination}?error=${encodeURIComponent("Välj målsman, lag och roll")}`);
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect(`/login?next=${encodeURIComponent(destination)}`);
  const { data: organization } = await supabase.from("organizations").select("id").eq("slug", slug).maybeSingle();
  if (!organization) redirect(`${destination}?error=${encodeURIComponent("Föreningen kunde inte hittas")}`);

  const { error } = await supabase.rpc("assign_existing_guardian_team_role", {
    target_organization_id: organization.id,
    target_team_id: teamId,
    target_user_id: userId,
    target_role: role as "team_manager" | "coach",
  });
  if (error) redirect(`${destination}?error=${encodeURIComponent("Rollen kunde inte tilldelas. Kontrollera din behörighet och att målsmannen hör till föreningen.")}`);
  redirect(`${destination}?saved=1`);
}
