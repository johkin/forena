import { beforeEach, expect, it, vi } from "vitest";

const { createClient, isSupabaseConfigured } = vi.hoisted(() => ({ createClient: vi.fn(), isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured }));
import { getTeamDashboard } from "./team-dashboard";

const organization = { id: "org", slug: "club", name: "Club", assistant_name: "Assistant", time_zone: "Europe/Stockholm" };
const team = { id: "team", organization_id: "org", section_id: "section", slug: "empty", name: "Empty team", season: "2026" };
const pastActivity = { id: "past", organization_id: "org", team_id: "team", activity_type_id: "training", title: "Past training", starts_at: "2026-09-01T10:00:00Z", ends_at: "2026-09-01T11:00:00Z", location: "Pitch", status: "published" };

type FamilyScenario = { invitations?: Record<string, unknown>[]; duties?: Record<string, unknown>[]; activities?: Record<string, unknown>[] };
const familyPeople = [
  { id: "elsa", organization_id: "org", display_name: "Elsa" },
  { id: "tilda", organization_id: "org", display_name: "Tilda" },
];
const training = { ...pastActivity, id: "training", starts_at: "2099-10-08T15:00:00Z", ends_at: "2099-10-08T16:30:00Z", invitation_send_at: "2020-01-01T00:00:00Z" };
const tildaInvitation = { id: "invite-tilda", organization_id: "org", activity_id: "training", person_id: "tilda", response: "accepted" };
function client({ authorized = true, signedIn = true, activityError = false, family }: { authorized?: boolean; signedIn?: boolean; activityError?: boolean; family?: FamilyScenario } = {}) {
  const queries: string[] = [];
  const from = (table: string) => {
    queries.push(table);
    let single = false;
    let historical = false;
    const filters: ((row: Record<string, unknown>) => boolean)[] = [];
    const result = () => {
      const rows: Record<string, unknown> = {
        organizations: single ? organization : [organization],
        teams: single ? team : [team],
        sections: [{ id: "section", organization_id: "org", slug: "sport", name: "Sport" }],
        organization_members: { role: authorized ? "admin" : "member" },
        people: family ? familyPeople : [],
        person_guardians: family ? familyPeople.map(p => ({ person_id:p.id, organization_id:"org", guardian_user_id:"user" })) : [],
        invitations: family?.invitations ?? [],
        memberships: family ? familyPeople.map(p => ({ person_id:p.id, role:"participant", team_id:"team" })) : authorized ? [{ person_id: "player", role: "participant", team_id: "team" }] : [],
        team_tasks: [{ id: "task", organization_id: "org", team_id: "team", title: "Book pitch", due_at: "2026-12-01T10:00:00Z", status: "open" }],
        activities: historical ? [pastActivity] : family ? family.activities ?? [training] : [],
      };
      const data = rows[table] ?? [];
      return { data: Array.isArray(data) ? data.filter(row => filters.every(filter => filter(row))) : data, error: table === "activities" && !historical && activityError ? { message: "Database failed" } : null };
    };
    const chain = {
      select: () => chain,
      eq: (key: string, value: unknown) => { if (["user_id", "guardian_user_id"].includes(key)) filters.push(row => row[key] === value); return chain; },
      in: (key: string, values: unknown[]) => { if (["id", "person_id", "activity_id", "team_id"].includes(key)) filters.push(row => values.includes(row[key])); return chain; }, is: () => chain,
      neq: () => chain, gte: () => chain, order: () => chain, limit: () => chain,
      or: () => chain, lte: () => { historical = table === "activities"; return chain; },
      maybeSingle: () => { single = true; return Promise.resolve(result()); },
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  };
  return { queries, auth: { getUser: async () => ({ data: { user: signedIn ? { id: "user", email: "leader@test.example" } : null } }) },
    from, rpc: async (name: string) => ({ data: name === "has_team_permission" ? authorized : name === "my_activity_duty_links" ? family?.duties ?? [] : [] }) };
}

beforeEach(() => vi.clearAllMocks());
it("keeps the authorized workspace, permissions, tasks and unreported past activities without upcoming activities", async () => {
  const supabase = client();
  createClient.mockResolvedValue(supabase);
  const result = await getTeamDashboard("club", "empty");
  expect(result).toMatchObject({ team: { id: "team" }, activity: null, upcomingActivities: [], invitations: [], source: "database", accountEmail: "leader@test.example" });
  expect(result?.teamPermissions).toContain("activity.manage");
  expect(result?.tasks.map(task => task.id)).toEqual(["task"]);
  expect(result?.missingAttendanceActivities.map(activity => activity.id)).toEqual(["past"]);
  expect(supabase.queries).not.toContain("invitations");
});
it.each([{ authorized: false }, { signedIn: false }])("does not grant a private workspace without access: %j", async options => {
  createClient.mockResolvedValue(client(options));
  expect(await getTeamDashboard("club", "empty")).toBeNull();
});
it("does not hide a failed activity query as an empty workspace", async () => {
  createClient.mockResolvedValue(client({ activityError: true }));
  await expect(getTeamDashboard("club", "empty")).rejects.toThrow("Lagets aktiviteter kunde inte hämtas.");
});

it("does not show Elsa's team activity when only Tilda is invited", async () => {
  createClient.mockResolvedValue(client({ family: { invitations: [tildaInvitation] } }));
  const result = await getTeamDashboard("club", "empty");
  expect(result?.familyActivities.map(item => [item.member.id, item.activity.id, item.invitation?.id])).toEqual([["tilda", "training", "invite-tilda"]]);
  expect(result?.upcomingActivities.map(item => item.id)).toContain("training");
});
it("does not show a team member's next activity without an invitation or duty", async () => {
  createClient.mockResolvedValue(client({ family: {} }));
  const result = await getTeamDashboard("club", "empty");
  expect(result?.familyActivities).toEqual([]);
  expect(result?.upcomingActivities).toHaveLength(1);
});
it("keeps a duty assignment without an invitation and combines it with a later invitation once", async () => {
  const duties = [{ person_id: "elsa", team_id: "team", activity_id: "training" }];
  createClient.mockResolvedValue(client({ family: { duties } }));
  expect((await getTeamDashboard("club", "empty"))?.familyActivities).toMatchObject([{ member: { id: "elsa" }, hasDutyAssignment: true, invitation: undefined }]);
  createClient.mockResolvedValue(client({ family: { duties, invitations: [{ ...tildaInvitation, id: "invite-elsa", person_id: "elsa" }] } }));
  expect((await getTeamDashboard("club", "empty"))?.familyActivities).toMatchObject([{ member: { id: "elsa" }, hasDutyAssignment: true, invitation: { id: "invite-elsa" } }]);
  expect((await getTeamDashboard("club", "empty"))?.familyActivities).toHaveLength(1);
});
it("hides an invitation before its send time but retains an independently booked duty", async () => {
  const future = { ...training, invitation_send_at: "2099-10-01T00:00:00Z" };
  createClient.mockResolvedValue(client({ family: { activities: [future], invitations: [tildaInvitation] } }));
  expect((await getTeamDashboard("club", "empty"))?.familyActivities).toEqual([]);
  createClient.mockResolvedValue(client({ family: { activities: [future], invitations: [tildaInvitation], duties: [{ person_id: "tilda", team_id: "team", activity_id: "training" }] } }));
  expect((await getTeamDashboard("club", "empty"))?.familyActivities).toMatchObject([{ member: { id: "tilda" }, hasDutyAssignment: true, invitation: undefined }]);
});
