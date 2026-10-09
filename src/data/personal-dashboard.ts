import type { FamilyActivity, Organization, Team } from "@/domain/club";
import { createClient } from "@/lib/supabase/server";
import { activityDateKey } from "@/lib/activity-range";

export type PersonalActivity = FamilyActivity & { organization: Organization };
export type PersonalTeam = { team: Team; organization: Organization; roles: string[] };
export type PersonalDashboardData = {
  accountEmail?: string;
  activities: PersonalActivity[];
  teams: PersonalTeam[];
  organizations: Organization[];
  referenceTime: string;
};

/** Exact counts avoid treating a server-side row limit as the end of the list. */
export async function readPersonalPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; count: number | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const result = await page(rows.length, rows.length + 499);
    if (result.error || result.count === null || !result.data) throw new Error("Din översikt kunde inte hämtas.");
    rows.push(...result.data);
    if (rows.length >= result.count) return rows;
    if (!result.data.length || rows.length > 20000) throw new Error("Din översikt kunde inte hämtas fullständigt.");
  }
}

async function readIds<T>(ids: string[], read: (ids: string[]) => Promise<T[]>): Promise<T[]> {
  const rows: T[] = [];
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 100) rows.push(...await read(unique.slice(i, i + 100)));
  return rows;
}

export async function getPersonalDashboard(): Promise<PersonalDashboardData | null> {
  const supabase = await createClient(); // Caller session, never service role.
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return null;
  const userId = auth.user.id;
  const referenceTime = new Date().toISOString();
  const [ownPeople, guardians, organizationMemberships] = await Promise.all([
    readPersonalPages((from, to) => supabase.from("people").select("id, organization_id, display_name", { count: "exact" }).eq("user_id", userId).order("id").range(from, to)),
    readPersonalPages((from, to) => supabase.from("person_guardians").select("person_id, organization_id", { count: "exact" }).eq("guardian_user_id", userId).order("person_id").range(from, to)),
    readPersonalPages((from, to) => supabase.from("organization_members").select("organization_id, role", { count: "exact" }).eq("user_id", userId).order("organization_id").range(from, to)),
  ]);
  const ownIds = new Set(ownPeople.map(person => person.id));
  const personIds = [...new Set([...ownIds, ...guardians.map(link => link.person_id)])];
  const organizationIds = [...new Set([...organizationMemberships.map(m => m.organization_id), ...ownPeople.map(p => p.organization_id), ...guardians.map(g => g.organization_id)])];
  const organizations = await readIds(organizationIds, ids => readPersonalPages((from, to) => supabase.from("organizations").select("id, slug, name, assistant_name, time_zone", { count: "exact" }).in("id", ids).order("id").range(from, to)));
  const organizationById = new Map<string, Organization>(organizations.map(o => [o.id, { id: o.id, slug: o.slug, name: o.name, assistantName: o.assistant_name, timeZone: o.time_zone }]));
  const [people, memberships, access, invitations, dutyLinks] = await Promise.all([
    readIds(personIds, ids => readPersonalPages((from, to) => supabase.from("people").select("id, organization_id, display_name", { count: "exact" }).in("id", ids).order("id").range(from, to))),
    readIds(personIds, ids => readPersonalPages((from, to) => supabase.from("memberships").select("id, person_id, team_id, role, starts_on, ends_on", { count: "exact" }).in("person_id", ids).order("id").range(from, to))),
    readIds([...ownIds], ids => readPersonalPages((from, to) => supabase.from("team_access_assignments").select("id, team_id, person_id, starts_on, ends_on", { count: "exact" }).in("person_id", ids).order("id").range(from, to))),
    readIds(personIds, ids => readPersonalPages((from, to) => supabase.from("invitations").select("id, organization_id, activity_id, person_id, response", { count: "exact" }).in("person_id", ids).order("id").range(from, to))),
    Promise.all(organizationIds.map(id => readPersonalPages((from, to) => supabase.rpc("my_activity_duty_links", { target_organization_id: id }, { count: "exact" }).order("activity_id").order("person_id").range(from, to)))).then(groups => groups.flat()),
  ]);
  const activityIds = [...invitations.map(i => i.activity_id), ...dutyLinks.map(d => d.activity_id)];
  const activityRows = await readIds(activityIds, ids => readPersonalPages((from, to) => supabase.from("activities").select("id, organization_id, team_id, activity_type_id, title, description_markdown, gathering_at, starts_at, ends_at, location, status, series_id, invitation_send_at, response_due_at", { count: "exact" }).in("id", ids).eq("status", "published").gte("ends_at", referenceTime).order("id").range(from, to)));
  const teamIds = [...memberships.flatMap(m => m.team_id ? [m.team_id] : []), ...access.map(a => a.team_id), ...activityRows.flatMap(a => a.team_id ? [a.team_id] : [])];
  const teamRows = await readIds(teamIds, ids => readPersonalPages((from, to) => supabase.from("teams").select("id, organization_id, section_id, slug, name, season", { count: "exact" }).in("id", ids).order("id").range(from, to)));
  const teamById = new Map<string, Team>(teamRows.map(t => [t.id, { id: t.id, organizationId: t.organization_id, sectionId: t.section_id, slug: t.slug, name: t.name, season: t.season }]));
  const peopleById = new Map(people.map(p => [p.id, p]));
  const invitationByKey = new Map(invitations.map(i => [`${i.activity_id}:${i.person_id}`, i]));
  const dutyKeys = new Set(dutyLinks.map(d => `${d.activity_id}:${d.person_id}`));
  const activities: PersonalActivity[] = activityRows.flatMap(a => {
    const organization = organizationById.get(a.organization_id);
    const team = a.team_id ? teamById.get(a.team_id) : undefined;
    if (!organization || !team || team.organizationId !== organization.id) return [];
    return personIds.flatMap(personId => {
      const person = peopleById.get(personId);
      if (!person || person.organization_id !== organization.id) return [];
      const key = `${a.id}:${personId}`;
      const invitation = invitationByKey.get(key);
      const visibleInvitation = invitation && (!a.invitation_send_at || Date.parse(a.invitation_send_at) <= Date.parse(referenceTime)) ? invitation : undefined;
      const hasDutyAssignment = dutyKeys.has(key);
      if (!visibleInvitation && !hasDutyAssignment) return [];
      return [{ organization, team, hasDutyAssignment,
        member: { id: person.id, organizationId: person.organization_id, displayName: person.display_name },
        activity: { id: a.id, organizationId: a.organization_id, teamId: team.id, activityTypeId: a.activity_type_id, title: a.title, description: a.description_markdown, gatheringAt: a.gathering_at ?? undefined, startsAt: a.starts_at, endsAt: a.ends_at, location: a.location, status: a.status, seriesId: a.series_id ?? undefined, invitationSendAt: a.invitation_send_at ?? undefined, responseDueAt: a.response_due_at ?? undefined },
        invitation: visibleInvitation ? { id: visibleInvitation.id, organizationId: visibleInvitation.organization_id, activityId: a.id, memberId: personId, response: visibleInvitation.response } : undefined,
      }];
    });
  }).sort((a, b) => Date.parse(a.activity.startsAt) - Date.parse(b.activity.startsAt) || a.activity.id.localeCompare(b.activity.id));
  const teams: PersonalTeam[] = [...teamById.values()].flatMap(team => {
    const organization = organizationById.get(team.organizationId);
    if (!organization) return [];
    const today = activityDateKey(referenceTime, organization.timeZone ?? "Europe/Stockholm");
    const active = (row: { starts_on: string; ends_on: string | null }) => row.starts_on <= today && (!row.ends_on || row.ends_on >= today);
    const roles = new Set<string>();
    for (const membership of memberships.filter(m => m.team_id === team.id && active(m))) {
      if (!ownIds.has(membership.person_id)) roles.add("Målsman");
      else roles.add(membership.role === "leader" ? "Ledare" : membership.role === "participant" ? "Spelare" : "Medlem");
    }
    if (access.some(a => a.team_id === team.id && active(a))) roles.add("Lagåtkomst");
    return roles.size ? [{ team, organization, roles: [...roles] }] : [];
  }).sort((a, b) => a.organization.name.localeCompare(b.organization.name, "sv") || a.team.name.localeCompare(b.team.name, "sv"));
  return { accountEmail: auth.user.email, activities, teams, organizations: [...organizationById.values()].sort((a, b) => a.name.localeCompare(b.name, "sv")), referenceTime };
}
