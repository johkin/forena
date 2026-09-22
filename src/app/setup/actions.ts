"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fail(message: string): never {
  redirect(`/setup?error=${encodeURIComponent(message)}`);
}

export async function createWorkspace(formData: FormData) {
  const organizationName = String(formData.get("organizationName") ?? "").trim();
  const requestedOrganizationSlug = String(formData.get("organizationSlug") ?? "").trim();
  const sectionName = String(formData.get("sectionName") ?? "").trim();
  const teamName = String(formData.get("teamName") ?? "").trim();
  const season = String(formData.get("season") ?? "").trim();

  if (
    !organizationName ||
    !sectionName ||
    !teamName ||
    !season ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(requestedOrganizationSlug)
  ) {
    fail("Kontrollera uppgifterna och försök igen");
  }

  const sectionSlug = slugify(sectionName);
  const teamSlug = slugify(teamName);
  if (!sectionSlug || !teamSlug) fail("Sektionens och lagets namn måste innehålla bokstäver eller siffror");

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) redirect("/login");

  const { data: existingMembership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  let organizationId = existingMembership?.organization_id;
  let organizationSlug = requestedOrganizationSlug;

  if (organizationId) {
    const { data: existingOrganization } = await supabase
      .from("organizations")
      .select("slug")
      .eq("id", organizationId)
      .single();
    if (!existingOrganization) fail("Din befintliga förening kunde inte läsas");
    organizationSlug = existingOrganization.slug;
  } else {
    const { data: organization, error } = await supabase
      .from("organizations")
      .insert({
        name: organizationName,
        slug: requestedOrganizationSlug,
        assistant_name: "Föreningsassistenten",
        created_by: user.id,
      })
      .select("id, slug")
      .single();

    if (error || !organization) {
      console.error("[setup] organization creation failed", { message: error?.message });
      fail("Föreningen kunde inte skapas. Kontrollera att adressnamnet är ledigt");
    }

    organizationId = organization.id;
    organizationSlug = organization.slug;
  }

  const { data: existingSection } = await supabase
    .from("sections")
    .select("id")
    .eq("organization_id", organizationId)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  let sectionId = existingSection?.id;
  if (!sectionId) {
    const { data: section, error } = await supabase
      .from("sections")
      .insert({
        organization_id: organizationId,
        name: sectionName,
        slug: sectionSlug,
      })
      .select("id")
      .single();

    if (error || !section) {
      console.error("[setup] section creation failed", { message: error?.message });
      fail("Sektionen kunde inte skapas");
    }
    sectionId = section.id;
  }

  const { data: existingTeam } = await supabase
    .from("teams")
    .select("id, slug")
    .eq("organization_id", organizationId)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  let teamId = existingTeam?.id;
  let resolvedTeamSlug = existingTeam?.slug ?? teamSlug;

  if (!teamId) {
    const { data: team, error } = await supabase
      .from("teams")
      .insert({
        organization_id: organizationId,
        section_id: sectionId,
        name: teamName,
        slug: teamSlug,
        season,
      })
      .select("id, slug")
      .single();

    if (error || !team) {
      console.error("[setup] team creation failed", { message: error?.message });
      fail("Laget kunde inte skapas");
    }
    teamId = team.id;
    resolvedTeamSlug = team.slug;
  }

  const { data: existingActivity } = await supabase
    .from("activities")
    .select("id")
    .eq("team_id", teamId)
    .limit(1)
    .maybeSingle();

  if (!existingActivity) {
    const startsAt = new Date();
    startsAt.setUTCDate(startsAt.getUTCDate() + 7);
    startsAt.setUTCHours(17, 30, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 90 * 60 * 1000);

    const { error } = await supabase.from("activities").insert({
      organization_id: organizationId,
      team_id: teamId,
      title: "Första lagaktiviteten",
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      location: "Plats anges senare",
      created_by: user.id,
    });

    if (error) {
      console.error("[setup] initial activity creation failed", { message: error.message });
      fail("Den första aktiviteten kunde inte skapas");
    }
  }

  redirect(`/o/${organizationSlug}/t/${resolvedTeamSlug}`);
}
