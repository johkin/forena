import {
  activity as demoActivity,
  invitations as demoInvitations,
  members as demoMembers,
  organization as demoOrganization,
  section as demoSection,
  team as demoTeam,
  tasks as demoTasks,
  workspaces as demoWorkspaces,
} from "@/data/demo";
import type { Activity, DashboardView, Invitation, Member, Organization, Section, Team, TeamTask, Workspace } from "@/domain/club";
import { createClient } from "@/lib/supabase/server";

export type TeamDashboardData = {
  organization: Organization;
  sections: Section[];
  team: Team;
  activity: Activity;
  members: Member[];
  invitations: Invitation[];
  workspaces: Workspace[];
  tasks: TeamTask[];
  defaultView: DashboardView;
  source: "database" | "demo";
};

function demoDashboard(): TeamDashboardData {
  return {
    organization: demoOrganization,
    sections: [demoSection],
    team: demoTeam,
    activity: demoActivity,
    members: demoMembers,
    invitations: demoInvitations,
    workspaces: demoWorkspaces,
    tasks: demoTasks,
    defaultView: "leader",
    source: "demo",
  };
}

function isConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith("replace-"),
  );
}

export async function getTeamDashboard(
  organizationSlug: string,
  teamSlug: string,
): Promise<TeamDashboardData | null> {
  if (!isConfigured()) {
    return organizationSlug === demoOrganization.slug && teamSlug === demoTeam.slug ? demoDashboard() : null;
  }

  const supabase = await createClient();
  const { data: organizationRow } = await supabase
    .from("organizations")
    .select("id, slug, name, assistant_name")
    .eq("slug", organizationSlug)
    .maybeSingle();

  if (!organizationRow) {
    return organizationSlug === demoOrganization.slug && teamSlug === demoTeam.slug ? demoDashboard() : null;
  }

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;

  const [{ data: sections }, { data: teams }, { data: teamRow }] = await Promise.all([
    supabase.from("sections").select("id, organization_id, slug, name").eq("organization_id", organizationRow.id).order("name"),
    supabase.from("teams").select("id, organization_id, section_id, slug, name, season").eq("organization_id", organizationRow.id).order("name"),
    supabase.from("teams").select("id, organization_id, section_id, slug, name, season").eq("organization_id", organizationRow.id).eq("slug", teamSlug).maybeSingle(),
  ]);

  if (!teamRow) return null;

  const { data: organizationMembership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationRow.id)
    .eq("user_id", authData.user.id)
    .maybeSingle();
  const hasOrganizationWideAccess = ["owner", "admin", "leader"].includes(organizationMembership?.role ?? "");
  let canManageCurrentTeam = hasOrganizationWideAccess;
  let accessibleTeams = teams ?? [];

  if (!hasOrganizationWideAccess) {
    const [{ data: teamRoles }, { data: sectionRoles }, { data: guardianLinks }, { data: ownPeople }] = await Promise.all([
      supabase.from("team_staff").select("team_id").eq("organization_id", organizationRow.id).eq("user_id", authData.user.id),
      supabase.from("section_staff").select("section_id").eq("organization_id", organizationRow.id).eq("user_id", authData.user.id),
      supabase.from("person_guardians").select("person_id").eq("organization_id", organizationRow.id).eq("guardian_user_id", authData.user.id),
      supabase.from("people").select("id").eq("organization_id", organizationRow.id).eq("user_id", authData.user.id),
    ]);
    const personIds = [...(guardianLinks ?? []).map((item) => item.person_id), ...(ownPeople ?? []).map((item) => item.id)];
    const { data: participantMemberships } = personIds.length
      ? await supabase.from("memberships").select("team_id").in("person_id", personIds)
      : { data: [] };
    const directTeamIds = new Set([
      ...(teamRoles ?? []).map((item) => item.team_id),
      ...(participantMemberships ?? []).flatMap((item) => (item.team_id ? [item.team_id] : [])),
    ]);
    canManageCurrentTeam = (teamRoles ?? []).some((item) => item.team_id === teamRow.id);
    const managedSectionIds = new Set((sectionRoles ?? []).map((item) => item.section_id));
    accessibleTeams = accessibleTeams.filter(
      (item) => directTeamIds.has(item.id) || managedSectionIds.has(item.section_id),
    );
  }

  if (!accessibleTeams.some((item) => item.id === teamRow.id)) return null;

  const { data: activityRow } = await supabase
    .from("activities")
    .select("id, organization_id, team_id, title, starts_at, ends_at, location")
    .eq("team_id", teamRow.id)
    .gte("ends_at", new Date().toISOString())
    .order("starts_at")
    .limit(1)
    .maybeSingle();

  if (!activityRow) {
    return organizationSlug === demoOrganization.slug && teamSlug === demoTeam.slug ? demoDashboard() : null;
  }

  const { data: invitationRows } = await supabase
    .from("invitations")
    .select("id, organization_id, activity_id, person_id, response, responded_at")
    .eq("activity_id", activityRow.id);
  const { data: taskRows } = await supabase
    .from("team_tasks")
    .select("id, organization_id, team_id, title, description, due_at, status")
    .eq("team_id", teamRow.id)
    .eq("status", "open")
    .order("due_at");
  const personIds = (invitationRows ?? []).map((invitation) => invitation.person_id);
  const { data: peopleRows } = personIds.length
    ? await supabase.from("people").select("id, organization_id, display_name").in("id", personIds)
    : { data: [] };
  const { data: guardianRows } = personIds.length
    ? await supabase.from("person_guardians").select("person_id, contact_name, contact_phone").in("person_id", personIds)
    : { data: [] };
  const guardianByPersonId = new Map((guardianRows ?? []).map((guardian) => [guardian.person_id, guardian]));

  const organization: Organization = {
    id: organizationRow.id,
    slug: organizationRow.slug,
    name: organizationRow.name,
    assistantName: organizationRow.assistant_name,
  };
  const sectionList: Section[] = (sections ?? []).map((item) => ({
    id: item.id,
    organizationId: item.organization_id,
    slug: item.slug,
    name: item.name,
  }));
  const team: Team = {
    id: teamRow.id,
    organizationId: teamRow.organization_id,
    sectionId: teamRow.section_id,
    slug: teamRow.slug,
    name: teamRow.name,
    season: teamRow.season,
  };
  const activity: Activity = {
    id: activityRow.id,
    organizationId: activityRow.organization_id,
    teamId: activityRow.team_id ?? team.id,
    title: activityRow.title,
    startsAt: activityRow.starts_at,
    endsAt: activityRow.ends_at,
    location: activityRow.location,
  };
  const members: Member[] = (peopleRows ?? []).map((person) => ({
    id: person.id,
    organizationId: person.organization_id,
    displayName: person.display_name,
    guardianName: guardianByPersonId.get(person.id)?.contact_name ?? undefined,
    guardianPhone: guardianByPersonId.get(person.id)?.contact_phone ?? undefined,
  }));
  const invitations: Invitation[] = (invitationRows ?? []).map((invitation) => ({
    id: invitation.id,
    organizationId: invitation.organization_id,
    activityId: invitation.activity_id,
    memberId: invitation.person_id,
    response: invitation.response,
    respondedAt: invitation.responded_at ?? undefined,
  }));
  const tasks: TeamTask[] = (taskRows ?? []).map((task) => ({
    id: task.id,
    organizationId: task.organization_id,
    teamId: task.team_id,
    title: task.title,
    description: task.description,
    dueAt: task.due_at,
    status: task.status,
    createdByLabel: "Kansliet",
  }));
  const sectionById = new Map(sectionList.map((item) => [item.id, item]));
  const showSections = sectionList.length > 1;
  const workspaces: Workspace[] = [
    {
      id: organization.id,
      kind: "organization",
      name: organization.name,
      description: "Föreningsnivå",
      href: `/o/${organization.slug}`,
      active: false,
    },
    ...(showSections
      ? sectionList.map((item) => ({
          id: item.id,
          kind: "section" as const,
          name: item.name,
          description: "Sektion",
          href: `/o/${organization.slug}/s/${item.slug}`,
          active: false,
        }))
      : []),
    ...accessibleTeams.map((item) => ({
      id: item.id,
      kind: "team" as const,
      name: item.name,
      description: showSections ? sectionById.get(item.section_id)?.name ?? "Lag" : "Lag",
      href: `/o/${organization.slug}/t/${item.slug}`,
      active: item.id === team.id,
    })),
  ];

  return { organization, sections: sectionList, team, activity, members, invitations, workspaces, tasks, defaultView: canManageCurrentTeam ? "leader" : "family", source: "database" };
}
