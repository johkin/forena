import { beforeEach, expect, it, vi } from "vitest";

const { createClient, isSupabaseConfigured } = vi.hoisted(() => ({ createClient: vi.fn(), isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured }));
import { getTeamDashboard } from "./team-dashboard";

const organization = { id: "org", slug: "club", name: "Club", assistant_name: "Assistant", time_zone: "Europe/Stockholm" };
const team = { id: "team", organization_id: "org", section_id: "section", slug: "empty", name: "Empty team", season: "2026" };
const pastActivity = { id: "past", organization_id: "org", team_id: "team", activity_type_id: "training", title: "Past training", starts_at: "2026-09-01T10:00:00Z", ends_at: "2026-09-01T11:00:00Z", location: "Pitch", status: "published" };

function client({ authorized = true, signedIn = true, activityError = false } = {}) {
  const queries: string[] = [];
  const from = (table: string) => {
    queries.push(table);
    let single = false;
    let historical = false;
    const result = () => {
      const rows: Record<string, unknown> = {
        organizations: single ? organization : [organization],
        teams: single ? team : [team],
        sections: [{ id: "section", organization_id: "org", slug: "sport", name: "Sport" }],
        organization_members: { role: authorized ? "admin" : "member" },
        people: [],
        memberships: authorized ? [{ person_id: "player", role: "participant", team_id: "team" }] : [],
        team_tasks: [{ id: "task", organization_id: "org", team_id: "team", title: "Book pitch", due_at: "2026-12-01T10:00:00Z", status: "open" }],
        activities: historical ? [pastActivity] : [],
      };
      return { data: rows[table] ?? [], error: table === "activities" && !historical && activityError ? { message: "Database failed" } : null };
    };
    const chain = {
      select: () => chain, eq: () => chain, in: () => chain, is: () => chain,
      neq: () => chain, gte: () => chain, order: () => chain, limit: () => chain,
      or: () => chain, lte: () => { historical = table === "activities"; return chain; },
      maybeSingle: () => { single = true; return Promise.resolve(result()); },
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  };
  return { queries, auth: { getUser: async () => ({ data: { user: signedIn ? { id: "user", email: "leader@test.example" } : null } }) },
    from, rpc: async (name: string) => ({ data: name === "has_team_permission" ? authorized : [] }) };
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
