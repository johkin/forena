import { activity as demoActivity, organization as demoOrganization, section as demoSection, team as demoTeam } from "@/data/demo";
import type { Organization, Section, Team, Workspace } from "@/domain/club";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type PublicActivity = {
  id: string;
  teamId: string;
  teamName: string;
  teamSlug: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  isMatch: boolean;
};

export type GeneralWorkspaceData = {
  organization: Organization;
  section?: Section;
  sections: Section[];
  teams: Team[];
  activities: PublicActivity[];
  workspaces: Workspace[];
  accountEmail?: string;
  source: "database" | "demo";
};

export async function getGeneralWorkspace(organizationSlug: string, sectionSlug?: string): Promise<GeneralWorkspaceData | null> {
  if (!isSupabaseConfigured()) {
    if (organizationSlug !== demoOrganization.slug || (sectionSlug && sectionSlug !== demoSection.slug)) return null;
    return {
      organization: demoOrganization,
      section: sectionSlug ? demoSection : undefined,
      sections: [demoSection],
      teams: [demoTeam],
      activities: [{ id: demoActivity.id, teamId: demoTeam.id, teamName: demoTeam.name, teamSlug: demoTeam.slug, title: demoActivity.title, startsAt: demoActivity.startsAt, endsAt: demoActivity.endsAt, location: demoActivity.location, isMatch: true }],
      workspaces: [],
      source: "demo",
    };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const { data: organizationRow } = await supabase.from("organizations").select("id, slug, name, assistant_name, time_zone").eq("slug", organizationSlug).maybeSingle();
  if (!organizationRow) return null;

  const [{ data: sectionRows }, { data: teamRows }, { data: activityTypes }] = await Promise.all([
    supabase.from("sections").select("id, organization_id, slug, name").eq("organization_id", organizationRow.id).order("name"),
    supabase.from("teams").select("id, organization_id, section_id, slug, name, season").eq("organization_id", organizationRow.id).order("name"),
    supabase.from("activity_types").select("id, system_category").eq("organization_id", organizationRow.id),
  ]);
  const sections: Section[] = (sectionRows ?? []).map((row) => ({ id: row.id, organizationId: row.organization_id, slug: row.slug, name: row.name }));
  const section = sectionSlug ? sections.find((item) => item.slug === sectionSlug) : undefined;
  if (sectionSlug && !section) return null;
  const teams: Team[] = (teamRows ?? []).filter((row) => !section || row.section_id === section.id).map((row) => ({ id: row.id, organizationId: row.organization_id, sectionId: row.section_id, slug: row.slug, name: row.name, season: row.season }));
  const teamIds = teams.map((team) => team.id);
  const now = new Date().toISOString();
  const horizon = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
  const { data: activityRows } = teamIds.length ? await supabase.from("activities")
    .select("id, team_id, activity_type_id, title, starts_at, ends_at, location")
    .in("team_id", teamIds).eq("status", "published").gte("ends_at", now).lte("starts_at", horizon).order("starts_at").limit(1000) : { data: [] };
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const matchTypeIds = new Set((activityTypes ?? []).filter((type) => type.system_category === "competition").map((type) => type.id));
  const activities: PublicActivity[] = (activityRows ?? []).flatMap((row) => {
    const team = row.team_id ? teamById.get(row.team_id) : undefined;
    return team ? [{ id: row.id, teamId: team.id, teamName: team.name, teamSlug: team.slug, title: row.title, startsAt: row.starts_at, endsAt: row.ends_at, location: row.location, isMatch: matchTypeIds.has(row.activity_type_id) }] : [];
  });
  const organization: Organization = { id: organizationRow.id, slug: organizationRow.slug, name: organizationRow.name, assistantName: organizationRow.assistant_name, timeZone: organizationRow.time_zone };
  const showSections = sections.length > 1;
  const workspaces: Workspace[] = [
    { id: organization.id, kind: "organization", name: organization.name, description: "Föreningsnivå", href: `/o/${organization.slug}`, active: !section },
    ...(showSections ? sections.map((item) => ({ id: item.id, kind: "section" as const, name: item.name, description: "Sektion", href: `/o/${organization.slug}/s/${item.slug}`, active: item.id === section?.id })) : []),
    ...(teamRows ?? []).map((row) => ({ id: row.id, kind: "team" as const, name: row.name, description: showSections ? sections.find((item) => item.id === row.section_id)?.name ?? "Lag" : "Lag", href: `/o/${organization.slug}/t/${row.slug}`, active: false })),
  ];
  return { organization, section, sections, teams, activities, workspaces, accountEmail: authData.user?.email, source: "database" };
}
