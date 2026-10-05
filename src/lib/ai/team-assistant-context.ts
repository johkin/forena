import { loadActivityConfiguration } from "../activity-configuration";
import { formatDateTimeInZone } from "../date-time";
import { TeamAssistantError, type AssistantDependencies, type AssistantViewerKind, type TeamAssistantInput } from "./team-assistant-types";

function validTimeZone(value: unknown, fallback: string) {
  if (typeof value !== "string" || value.length > 80) return fallback;
  try {
    new Intl.DateTimeFormat("sv-SE", { timeZone: value }).format();
    return value;
  } catch {
    return fallback;
  }
}

export async function loadTeamAssistantContext(input: TeamAssistantInput, { supabase, userId }: AssistantDependencies) {
  const { teamId } = input;
  const { data: team } = await supabase.from("teams").select("id, organization_id, section_id, discipline_id, name").eq("id", teamId).maybeSingle();
  if (!team) throw new TeamAssistantError("team-not-found", "Laget kunde inte hittas.");

  const [
    { data: canViewTeam },
    { data: canManageActivities },
    { data: canManageInvitations },
    { data: canManageTasks },
    { data: ownPeople },
    { data: guardianLinks },
  ] = await Promise.all([
    supabase.rpc("has_team_permission", { target_team_id: teamId, target_permission: "team.view" }),
    supabase.rpc("has_team_permission", { target_team_id: teamId, target_permission: "activity.manage" }),
    supabase.rpc("has_team_permission", { target_team_id: teamId, target_permission: "invitation.manage" }),
    supabase.rpc("has_team_permission", { target_team_id: teamId, target_permission: "task.manage" }),
    supabase.from("people").select("id, display_name").eq("organization_id", team.organization_id).eq("user_id", userId),
    supabase.from("person_guardians").select("person_id").eq("organization_id", team.organization_id).eq("guardian_user_id", userId),
  ]);
  const personalIds = [...new Set([...(ownPeople ?? []).map((item) => item.id), ...(guardianLinks ?? []).map((item) => item.person_id)])];
  const { data: personalMemberships } = personalIds.length
    ? await supabase.from("memberships").select("person_id").eq("team_id", teamId).eq("role", "participant").is("ends_on", null).in("person_id", personalIds)
    : { data: [] };
  if (!canViewTeam && !(personalMemberships ?? []).length) throw new TeamAssistantError("team-forbidden", "Du saknar åtkomst till laget.");

  const [{ data: organization }, { data: activities }, { data: section }, { data: memories }] = await Promise.all([
    supabase.from("organizations").select("name, assistant_name, time_zone, discipline_id").eq("id", team.organization_id).single(),
    supabase.from("activities").select("id, activity_type_id, title, description_markdown, gathering_at, starts_at, ends_at, location").eq("team_id", teamId).neq("status", "cancelled").gte("ends_at", new Date().toISOString()).order("starts_at").limit(5),
    supabase.from("sections").select("discipline_id, name").eq("id", team.section_id).maybeSingle(),
    supabase.from("assistant_memories")
      .select("scope, discipline_id, kind, subject, memory_key, content, updated_at")
      .or(`scope.eq.system,and(scope.eq.organization,scope_id.eq.${team.organization_id}),and(scope.eq.section,scope_id.eq.${team.section_id}),and(scope.eq.team,scope_id.eq.${teamId}),and(scope.eq.personal,scope_id.eq.${userId},organization_id.eq.${team.organization_id})`)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("updated_at", { ascending: false })
      .limit(80),
  ]);
  const disciplineId = team.discipline_id ?? section?.discipline_id ?? organization?.discipline_id ?? null;
  const relevantMemories = (memories ?? [])
    .filter((memory) => memory.discipline_id === null || memory.discipline_id === disciplineId)
    .slice(0, 40);

  const configuration = canManageActivities ? await loadActivityConfiguration(supabase, teamId) : null;

  const activityIds = (activities ?? []).map((item) => item.id);
  const activityTypeIds = [...new Set((activities ?? []).map((item) => item.activity_type_id))];

  const [{ data: personalInvitations }, { data: teamInvitations }, { data: documentLinks }, { data: tasks }] = await Promise.all([
    activityIds.length && personalIds.length
      ? supabase.from("invitations").select("activity_id, person_id, response, response_comment").in("activity_id", activityIds).in("person_id", personalIds)
      : Promise.resolve({ data: [] }),
    canManageInvitations && activityIds.length
      ? supabase.from("invitations").select("activity_id, response, response_comment").in("activity_id", activityIds)
      : Promise.resolve({ data: [] }),
    activityTypeIds.length
      ? supabase.from("activity_type_documents").select("activity_type_id, document_id").eq("organization_id",team.organization_id).in("activity_type_id", activityTypeIds)
      : Promise.resolve({ data: [] }),
    canManageTasks
      ? supabase.from("team_tasks").select("title, description, due_at").eq("team_id", teamId).eq("status", "open").order("due_at").limit(8)
      : Promise.resolve({ data: [] }),
  ]);

  const documentIds = [...new Set((documentLinks ?? []).map((item) => item.document_id))];
  const { data: documents } = documentIds.length
    ? await supabase.from("contextual_documents").select("id, title, summary, content_markdown, audience").in("id", documentIds)
    : { data: [] };
  const allowedAudiences = canViewTeam
    ? new Set(["leaders"])
    : new Set([...(ownPeople?.length ? ["players"] : []), ...(guardianLinks?.length ? ["guardians"] : [])]);
  const visibleDocuments = (documents ?? []).filter((document) => document.audience.some((audience) => allowedAudiences.has(audience)));
  const invitationsByActivity = new Map<string, typeof personalInvitations>();
  for (const invitation of personalInvitations ?? []) {
    const current = invitationsByActivity.get(invitation.activity_id) ?? [];
    current.push(invitation);
    invitationsByActivity.set(invitation.activity_id, current);
  }
  const documentsByType = new Map<string, typeof visibleDocuments>();
  for (const link of documentLinks ?? []) {
    const document = visibleDocuments.find((item) => item.id === link.document_id);
    if (document) documentsByType.set(link.activity_type_id, [...(documentsByType.get(link.activity_type_id) ?? []), document]);
  }

  const organizationTimeZone = validTimeZone(organization?.time_zone, "Europe/Stockholm");
  const viewerTimeZone = validTimeZone(input.timeZone, organizationTimeZone);
  const localTime = (value: string | Date | null, timeZone: string) => formatDateTimeInZone(value, timeZone);
  const now = new Date();
  const organizationTodayParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: organizationTimeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const organizationToday = `${organizationTodayParts.year}-${organizationTodayParts.month}-${organizationTodayParts.day}`;

  const context = {
    clock: {
      instantUtc: now.toISOString(),
      organizationTimeZone,
      organizationLocalTime: localTime(now, organizationTimeZone),
      viewerTimeZone,
      viewerLocalTime: localTime(now, viewerTimeZone),
    },
    organization: organization?.name,
    team: team.name,
    viewer: { kind: (canViewTeam ? "leader" : "player-or-guardian") as AssistantViewerKind, people: (ownPeople ?? []).map((item) => item.display_name) },
    activities: (activities ?? []).map((activity) => ({
      id: activity.id,
      title: activity.title,
      description: activity.description_markdown,
      gatheringAt: activity.gathering_at ? { instantUtc: activity.gathering_at, organizationLocal: localTime(activity.gathering_at, organizationTimeZone), viewerLocal: localTime(activity.gathering_at, viewerTimeZone) } : null,
      startsAt: { instantUtc: activity.starts_at, organizationLocal: localTime(activity.starts_at, organizationTimeZone), viewerLocal: localTime(activity.starts_at, viewerTimeZone) },
      endsAt: { instantUtc: activity.ends_at, organizationLocal: localTime(activity.ends_at, organizationTimeZone), viewerLocal: localTime(activity.ends_at, viewerTimeZone) },
      location: activity.location,
      ownInvitations: invitationsByActivity.get(activity.id) ?? [],
      teamResponseSummary: canManageInvitations ? {
        accepted: (teamInvitations ?? []).filter((item) => item.activity_id === activity.id && item.response === "accepted").length,
        declined: (teamInvitations ?? []).filter((item) => item.activity_id === activity.id && item.response === "declined").length,
        pending: (teamInvitations ?? []).filter((item) => item.activity_id === activity.id && item.response === "pending").length,
        comments: (teamInvitations ?? []).filter((item) => item.activity_id === activity.id && item.response_comment).map((item) => item.response_comment).slice(0, 8),
      } : undefined,
      instructions: (documentsByType.get(activity.activity_type_id) ?? []).map((document) => ({ title: document.title, summary: document.summary, content: document.content_markdown.slice(0, 3000) })),
    })),
    tasks: (tasks ?? []).map((task) => ({ title: task.title, description: task.description, dueAt: { instantUtc: task.due_at, organizationLocal: localTime(task.due_at, organizationTimeZone), viewerLocal: localTime(task.due_at, viewerTimeZone) } })),
    disciplineId,
    activityTypes: configuration?.types.map(type=>({id:type.id,name:type.name,category:type.system_category,defaults:type.defaults})),
    memories: relevantMemories.map((memory) => ({
      scope: memory.scope,
      kind: memory.kind,
      subject: memory.subject,
      key: memory.memory_key,
      disciplineId: memory.discipline_id,
      content: memory.content,
    })),
  };
  return {
    organization,
    activities,
    activityIds,
    canManageActivities: Boolean(canManageActivities),
    canManageInvitations: Boolean(canManageInvitations),
    memoryScope: { organizationId: team.organization_id, sectionId: team.section_id, teamId, userId, disciplineId,
      organizationName: organization?.name, sectionName: section?.name, teamName: team.name },
    context,
    organizationToday,
  };
}
