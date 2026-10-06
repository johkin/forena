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
import type { Activity, FamilyActivity, Invitation, Member, Organization, Section, Team, TeamPermission, TeamTask, Workspace } from "@/domain/club";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type TeamDashboardData = {
  organization: Organization;
  sections: Section[];
  team: Team;
  activity: Activity | null;
  members: Member[];
  rosterMembers: Member[];
  upcomingActivities: Activity[];
  invitations: Invitation[];
  workspaces: Workspace[];
  tasks: TeamTask[];
  familyActivities: FamilyActivity[];
  canManageTeam: boolean;
  teamPermissions: TeamPermission[];
  canAdministerOrganization: boolean;
  accountEmail?: string;
  respondablePersonIds: string[];
  referenceTime: string;
  missingAttendanceActivities: Activity[];
  source: "database" | "demo";
};

function demoDashboard(): TeamDashboardData {
  return {
    organization: demoOrganization,
    sections: [demoSection],
    team: demoTeam,
    activity: demoActivity,
    members: demoMembers,
    rosterMembers: demoMembers,
    upcomingActivities: [demoActivity],
    invitations: demoInvitations,
    workspaces: demoWorkspaces,
    tasks: demoTasks,
    familyActivities: [],
    canManageTeam: true,
    teamPermissions: ["team.view", "team.manage", "activity.manage", "invitation.manage", "attendance.manage", "roster.manage", "responsibility.manage", "task.manage"],
    canAdministerOrganization: false,
    respondablePersonIds: demoMembers.map((item) => item.id),
    referenceTime: new Date().toISOString(),
    missingAttendanceActivities: [],
    source: "demo",
  };
}

export async function getTeamDashboard(
  organizationSlug: string,
  teamSlug: string,
): Promise<TeamDashboardData | null> {
  const referenceTime = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    return organizationSlug === demoOrganization.slug && teamSlug === demoTeam.slug ? demoDashboard() : null;
  }

  const supabase = await createClient();
  const { data: organizationRow } = await supabase
    .from("organizations")
    .select("id, slug, name, assistant_name, time_zone")
    .eq("slug", organizationSlug)
    .maybeSingle();

  if (!organizationRow) {
    return null;
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
  const hasOrganizationWideAccess = ["owner", "admin"].includes(organizationMembership?.role ?? "");
  let accessibleTeams = teams ?? [];

  if (!hasOrganizationWideAccess) {
    const [{ data: sectionRoles }, { data: guardianLinks }, { data: ownPeople }] = await Promise.all([
      supabase.from("section_staff").select("section_id").eq("organization_id", organizationRow.id).eq("user_id", authData.user.id),
      supabase.from("person_guardians").select("person_id").eq("organization_id", organizationRow.id).eq("guardian_user_id", authData.user.id),
      supabase.from("people").select("id").eq("organization_id", organizationRow.id).eq("user_id", authData.user.id),
    ]);
    const personIds = [...(guardianLinks ?? []).map((item) => item.person_id), ...(ownPeople ?? []).map((item) => item.id)];
    const ownPersonIds = (ownPeople ?? []).map((item) => item.id);
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: participantMemberships }, { data: accessAssignments }] = await Promise.all([
      personIds.length
        ? supabase.from("memberships").select("team_id").in("person_id", personIds)
        : Promise.resolve({ data: [] }),
      ownPersonIds.length
        ? supabase.from("team_access_assignments").select("team_id").in("person_id", ownPersonIds).lte("starts_on", today).or(`ends_on.is.null,ends_on.gte.${today}`)
        : Promise.resolve({ data: [] }),
    ]);
    const directTeamIds = new Set([
      ...(accessAssignments ?? []).map((item) => item.team_id),
      ...(participantMemberships ?? []).flatMap((item) => (item.team_id ? [item.team_id] : [])),
    ]);
    const managedSectionIds = new Set((sectionRoles ?? []).map((item) => item.section_id));
    accessibleTeams = accessibleTeams.filter(
      (item) => directTeamIds.has(item.id) || managedSectionIds.has(item.section_id),
    );
  }

  if (!accessibleTeams.some((item) => item.id === teamRow.id)) return null;

  const permissionKeys: TeamPermission[] = [
    "team.view",
    "team.manage",
    "activity.manage",
    "invitation.manage",
    "attendance.manage",
    "roster.manage",
    "responsibility.manage",
    "task.manage",
  ];
  const permissionResults = await Promise.all(
    permissionKeys.map((permission) =>
      supabase.rpc("has_team_permission", {
        target_team_id: teamRow.id,
        target_permission: permission,
      }),
    ),
  );
  const teamPermissions = permissionKeys.filter((_, index) => permissionResults[index].data === true);
  const canManageCurrentTeam = teamPermissions.includes("team.manage");
  const canManageInvitations = teamPermissions.includes("invitation.manage");
  const canManageAttendance = teamPermissions.includes("attendance.manage");

  const [{ data: guardianLinksForUser }, { data: ownPeopleForUser }] = await Promise.all([
    supabase.from("person_guardians").select("person_id").eq("organization_id", organizationRow.id).eq("guardian_user_id", authData.user.id),
    supabase.from("people").select("id").eq("organization_id", organizationRow.id).eq("user_id", authData.user.id),
  ]);
  const familyPersonIds = [...new Set([
    ...(guardianLinksForUser ?? []).map((item) => item.person_id),
    ...(ownPeopleForUser ?? []).map((item) => item.id),
  ])];
  const { data: familyInvitationRows } = familyPersonIds.length
    ? await supabase.from("invitations").select("id, organization_id, activity_id, person_id, response, responded_at, response_comment, duty_type_id").in("person_id", familyPersonIds)
    : { data: [] };
  const { data: familyMembershipRows } = familyPersonIds.length
    ? await supabase.from("memberships").select("person_id, team_id").in("person_id", familyPersonIds).in("role", ["participant", "leader"]).is("ends_on", null)
    : { data: [] };
  const familyInvitedActivityIds = [...new Set((familyInvitationRows ?? []).map(i => i.activity_id))];
  const { data: invitedActivities } = familyInvitedActivityIds.length
    ? await supabase.from("activities").select("id, team_id").in("id", familyInvitedActivityIds).neq("status", "cancelled").gte("ends_at", referenceTime)
    : { data: [] };
  const invitationTeamByActivity = new Map((invitedActivities ?? []).map(a => [a.id, a.team_id]));
  // A personal invitation creates an activity link, never a team membership or team permission.
  const { data: familyDutyLinks } = await supabase.rpc("my_activity_duty_links", { target_organization_id: organizationRow.id });
  const familyLinks = [...(familyDutyLinks ?? []).map(link => ({ person_id: link.person_id, team_id: link.team_id, activityId: link.activity_id })),...(familyMembershipRows ?? []).map(m => ({ ...m, activityId: undefined as string | undefined })),
    ...(familyInvitationRows ?? []).flatMap(i => {
      const teamId = invitationTeamByActivity.get(i.activity_id);
      return teamId ? [{ person_id: i.person_id, team_id: teamId, activityId: i.activity_id }] : [];
    })];
  const { data: familyDutyTypes } = await supabase.from("activity_duty_types").select("id, name").eq("organization_id", organizationRow.id);
  const dutyNameById = new Map((familyDutyTypes ?? []).map(d => [d.id, d.name]));
  const familyTeamIds = [...new Set(familyLinks.flatMap((item) => item.team_id ? [item.team_id] : []))];
  const [{ data: familyPeopleRows }, { data: familyTeamRows }, { data: familyActivityRows }] = await Promise.all([
    familyPersonIds.length ? supabase.from("people").select("id, organization_id, display_name").in("id", familyPersonIds) : Promise.resolve({ data: [] }),
    familyTeamIds.length ? supabase.from("teams").select("id, organization_id, section_id, slug, name, season").in("id", familyTeamIds) : Promise.resolve({ data: [] }),
    familyTeamIds.length ? supabase.from("activities").select("id, organization_id, team_id, activity_type_id, title, gathering_at, starts_at, ends_at, location, series_id, status, invitation_send_at, response_due_at, reminder_send_at").in("team_id", familyTeamIds).neq("status", "cancelled").gte("ends_at", referenceTime).order("starts_at") : Promise.resolve({ data: [] }),
  ]);
  const nextActivityByTeam = new Map<string, NonNullable<typeof familyActivityRows>[number]>();
  for (const item of familyActivityRows ?? []) {
    if (item.team_id && !nextActivityByTeam.has(item.team_id)) nextActivityByTeam.set(item.team_id, item);
  }

  const { data: upcomingActivityRows, error: upcomingActivitiesError } = await supabase
    .from("activities")
    .select("id, organization_id, team_id, activity_type_id, title, description_markdown, gathering_at, starts_at, ends_at, location, series_id, status, invitation_send_at, response_due_at, reminder_send_at")
    .eq("team_id", teamRow.id)
    .neq("status", "cancelled")
    .gte("ends_at", referenceTime)
    .order("starts_at")
    .limit(200);
  const activityRow = upcomingActivityRows?.[0];

  if (upcomingActivitiesError) throw new Error("Lagets aktiviteter kunde inte hämtas.");

  // An empty activity list is still an authorized team workspace.
  let invitationRows: Array<{
    id: string; organization_id: string; activity_id: string; person_id: string;
    response: Invitation["response"]; responded_at: string | null;
    response_comment: string | null; duty_type_id: string | null;
  }> = [];
  if (activityRow && (canManageInvitations || familyPersonIds.length)) {
    const invitationQuery = supabase
      .from("invitations")
      .select("id, organization_id, activity_id, person_id, response, responded_at, response_comment, duty_type_id")
      .eq("activity_id", activityRow.id);
    const { data } = canManageInvitations
      ? await invitationQuery
      : await invitationQuery.in("person_id", familyPersonIds);
    invitationRows = data ?? [];
  }
  const { data: rosterRows } = await supabase
    .from("memberships")
    .select("person_id, role")
    .eq("team_id", teamRow.id)
    .in("role", ["participant", "leader"])
    .is("ends_on", null);
  const { data: taskRows } = await supabase
    .from("team_tasks")
    .select("id, organization_id, team_id, title, description, due_at, status")
    .eq("team_id", teamRow.id)
    .eq("status", "open")
    .order("due_at");
  const personIds = [...new Set([
    ...(rosterRows ?? []).map((membership) => membership.person_id),
    ...(invitationRows ?? []).map((invitation) => invitation.person_id),
  ])];
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
    timeZone: organizationRow.time_zone,
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
  const activity: Activity | null = activityRow ? {
    id: activityRow.id,
    organizationId: activityRow.organization_id,
    teamId: activityRow.team_id ?? team.id,
    title: activityRow.title, activityTypeId: activityRow.activity_type_id,
    description: activityRow.description_markdown,
    gatheringAt: activityRow.gathering_at ?? undefined,
    startsAt: activityRow.starts_at,
    endsAt: activityRow.ends_at,
    location: activityRow.location,
    seriesId: activityRow.series_id ?? undefined,
    status: activityRow.status,
    invitationSendAt: activityRow.invitation_send_at ?? undefined,
    responseDueAt: activityRow.response_due_at ?? undefined,
    reminderSendAt: activityRow.reminder_send_at ?? undefined,
  } : null;
  const members: Member[] = (peopleRows ?? []).map((person) => ({
    id: person.id,
    organizationId: person.organization_id,
    displayName: person.display_name,
    guardianName: guardianByPersonId.get(person.id)?.contact_name ?? undefined,
    guardianPhone: guardianByPersonId.get(person.id)?.contact_phone ?? undefined,
  }));
  const rosterRelationByMemberId = new Map((rosterRows ?? []).map((membership) => [membership.person_id, membership.role === "participant" ? "player" as const : "leader" as const]));
  const rosterMembers = members
    .filter((member) => rosterRelationByMemberId.has(member.id))
    .map((member) => ({ ...member, teamRelation: rosterRelationByMemberId.get(member.id) }));
  const upcomingActivities: Activity[] = (upcomingActivityRows ?? []).map((item) => ({
    id: item.id, organizationId: item.organization_id, teamId: item.team_id ?? team.id, title: item.title, activityTypeId: item.activity_type_id, description: item.description_markdown,
    gatheringAt: item.gathering_at ?? undefined, startsAt: item.starts_at, endsAt: item.ends_at, location: item.location,
    seriesId: item.series_id ?? undefined, status: item.status, invitationSendAt: item.invitation_send_at ?? undefined,
    responseDueAt: item.response_due_at ?? undefined, reminderSendAt: item.reminder_send_at ?? undefined,
  }));
  const invitations: Invitation[] = (invitationRows ?? []).map((invitation) => ({
    id: invitation.id,
    organizationId: invitation.organization_id,
    activityId: invitation.activity_id,
    memberId: invitation.person_id,
    response: invitation.response,
    respondedAt: invitation.responded_at ?? undefined,
    responseComment: invitation.response_comment ?? undefined,
    dutyName: dutyNameById.get(invitation.duty_type_id ?? ""),
  }));
  const startedActivityRows = canManageAttendance
    ? await supabase
        .from("activities")
        .select("id, organization_id, team_id, activity_type_id, title, gathering_at, starts_at, ends_at, location, series_id, status, invitation_send_at, response_due_at, reminder_send_at")
        .eq("team_id", teamRow.id)
        .neq("status", "cancelled")
        .lte("starts_at", referenceTime)
        .order("starts_at", { ascending: false })
        .limit(20)
    : { data: [] };
  const startedIds = (startedActivityRows.data ?? []).map((item) => item.id);
  const { data: attendanceReportRows } = startedIds.length
    ? await supabase.from("activity_attendance_reports").select("activity_id").in("activity_id", startedIds)
    : { data: [] };
  const reportedActivityIds = new Set((attendanceReportRows ?? []).map((item) => item.activity_id));
  const missingAttendanceActivities: Activity[] = (startedActivityRows.data ?? []).filter((item) => !reportedActivityIds.has(item.id)).map((item) => ({
    id: item.id, organizationId: item.organization_id, teamId: item.team_id ?? team.id, title: item.title, activityTypeId: item.activity_type_id,
    gatheringAt: item.gathering_at ?? undefined, startsAt: item.starts_at, endsAt: item.ends_at, location: item.location,
    seriesId: item.series_id ?? undefined, status: item.status, invitationSendAt: item.invitation_send_at ?? undefined,
    responseDueAt: item.response_due_at ?? undefined, reminderSendAt: item.reminder_send_at ?? undefined,
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

  const familyPeopleById = new Map((familyPeopleRows ?? []).map((item) => [item.id, item]));
  const familyTeamsById = new Map((familyTeamRows ?? []).map((item) => [item.id, item]));
  const familyInvitationByKey = new Map((familyInvitationRows ?? []).map((item) => [`${item.person_id}:${item.activity_id}`, item]));
  const familyActivities: FamilyActivity[] = familyLinks.flatMap((membership) => {
    if (!membership.team_id) return [];
    const person = familyPeopleById.get(membership.person_id);
    const teamItem = familyTeamsById.get(membership.team_id);
    const activityItem = membership.activityId ? (familyActivityRows ?? []).find(a => a.id === membership.activityId) : (familyActivityRows ?? []).find((candidate) =>
      candidate.team_id === membership.team_id
      && familyInvitationByKey.has(`${person?.id}:${candidate.id}`),
    ) ?? nextActivityByTeam.get(membership.team_id);
    if (!person || !teamItem || !activityItem) return [];
    const invitationItem = familyInvitationByKey.get(`${person.id}:${activityItem.id}`);
    return [{
      hasDutyAssignment: (familyDutyLinks ?? []).some(link => link.activity_id === activityItem.id && link.person_id === person.id),
      member: { id: person.id, organizationId: person.organization_id, displayName: person.display_name },
      team: { id: teamItem.id, organizationId: teamItem.organization_id, sectionId: teamItem.section_id, slug: teamItem.slug, name: teamItem.name, season: teamItem.season },
      activity: { id: activityItem.id, organizationId: activityItem.organization_id, teamId: activityItem.team_id ?? teamItem.id, title: activityItem.title, activityTypeId: activityItem.activity_type_id, gatheringAt: activityItem.gathering_at ?? undefined, startsAt: activityItem.starts_at, endsAt: activityItem.ends_at, location: activityItem.location, seriesId: activityItem.series_id ?? undefined, status: activityItem.status, invitationSendAt: activityItem.invitation_send_at ?? undefined, responseDueAt: activityItem.response_due_at ?? undefined, reminderSendAt: activityItem.reminder_send_at ?? undefined },
      invitation: invitationItem && (!activityItem.invitation_send_at || new Date(activityItem.invitation_send_at) <= new Date()) ? { id: invitationItem.id, organizationId: invitationItem.organization_id, activityId: invitationItem.activity_id, memberId: invitationItem.person_id, response: invitationItem.response, respondedAt: invitationItem.responded_at ?? undefined, responseComment: invitationItem.response_comment ?? undefined, dutyName: dutyNameById.get(invitationItem.duty_type_id ?? "") } : undefined,
    }];
  });

  return { organization, sections: sectionList, team, activity, members, rosterMembers, upcomingActivities, invitations, workspaces, tasks, familyActivities: [...new Map(familyActivities.map(item => [`${item.member.id}:${item.activity.id}`, item])).values()], canManageTeam: canManageCurrentTeam, teamPermissions, canAdministerOrganization: ["owner", "admin"].includes(organizationMembership?.role ?? ""), accountEmail: authData.user.email, respondablePersonIds: familyPersonIds, referenceTime, missingAttendanceActivities, source: "database" };
}

