import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPersonalDashboard, readPersonalPages } from "./personal-dashboard";

const state = vi.hoisted(() => ({ user: { id: "user", email: "parent@example.test" } as { id: string; email: string } | null, tables: {} as Record<string, Record<string, unknown>[]>, calls: [] as { table: string; field: string; value: unknown }[] }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: state.user } }) },
  from: (table: string) => query(table),
  rpc: (_name: string, args: { target_organization_id: string }) => query("duties").eq("organization_id", args.target_organization_id),
}) }));

function query(table: string) {
  let rows = state.tables[table] ?? [];
  const builder = {
    select: () => builder,
    eq: (field: string, value: unknown) => { state.calls.push({ table, field, value }); rows = rows.filter(row => row[field] === value); return builder; },
    in: (field: string, values: unknown[]) => { state.calls.push({ table, field, value: values }); rows = rows.filter(row => values.includes(row[field])); return builder; },
    gte: (field: string, value: string) => { rows = rows.filter(row => String(row[field]) >= value); return builder; },
    order: () => builder,
    range: async (from: number, to: number) => ({ data: rows.slice(from, to + 1), count: rows.length, error: null }),
  };
  return builder;
}

const person = (id: string, org: string, user_id: string | null = null) => ({ id, organization_id: org, display_name: id, user_id });
const activity = (id: string, org: string, team: string) => ({ id, organization_id: org, team_id: team, title: id, starts_at: "2030-01-01T10:00:00Z", ends_at: "2030-01-01T12:00:00Z", status: "published", location: "Pitch", invitation_send_at: "2020-01-01T10:00:00Z" });

beforeEach(() => {
  state.user = { id: "user", email: "parent@example.test" };
  state.calls = [];
  state.tables = {
    people: [person("parent", "uik", "user"), person("child1", "uik"), person("child2", "aik"), person("other", "aik")],
    person_guardians: [ { person_id: "child1", organization_id: "uik", guardian_user_id: "user" }, { person_id: "child2", organization_id: "aik", guardian_user_id: "user" }, { person_id: "other", organization_id: "aik", guardian_user_id: "someone" } ],
    organization_members: [{ organization_id: "uik", user_id: "user", role: "member" }],
    organizations: [ { id: "uik", name: "UIK", slug: "uik", time_zone: "Europe/Stockholm" }, { id: "aik", name: "AIK", slug: "aik", time_zone: "Europe/Stockholm" }, { id: "secret", name: "Secret" } ],
    teams: [{ id: "football", organization_id: "uik", section_id: "football", name: "F2016", slug: "f2016" }, { id: "floorball", organization_id: "aik", section_id: "floorball", name: "F2013", slug: "f2013" }, { id: "guest", organization_id: "aik", name: "F2015" }],
    memberships: [{ id: "m1", person_id: "child1", team_id: "football", role: "participant", starts_on: "2020-01-01", ends_on: null }, { id: "m2", person_id: "child2", team_id: "floorball", role: "participant", starts_on: "2020-01-01", ends_on: null }, { id: "m3", person_id: "parent", team_id: "football", role: "leader", starts_on: "2020-01-01", ends_on: null }],
    invitations: [{ id: "i1", organization_id: "uik", person_id: "child1", activity_id: "training", response: "pending" }, { id: "i2", organization_id: "uik", person_id: "parent", activity_id: "training", response: "accepted" }, { id: "i3", organization_id: "aik", person_id: "child2", activity_id: "match", response: "declined" }, { id: "private", organization_id: "aik", person_id: "other", activity_id: "match", response: "accepted" }],
    activities: [activity("training", "uik", "football"), activity("match", "aik", "floorball"), activity("uncalled", "uik", "football")],
    duties: [],
  };
});

describe("personal cross-club dashboard", () => {
  it("preserves a club role without a team role and does not infer roles from guardian links", async () => {
    state.tables.organization_members = [{ organization_id: "uik", user_id: "user", role: "admin" }];
    state.tables.memberships = [];
    const data = await getPersonalDashboard();
    expect(data?.teams).toEqual([]);
    expect(data?.organizations.find(o => o.id === "uik")?.role).toBe("admin");
    expect(data?.organizations.find(o => o.id === "aik")?.role).toBeUndefined();
  });
  it("loads own and guarded people's activities across clubs, never teammates' responses", async () => {
    const data = await getPersonalDashboard();
    expect(data?.organizations.map(o => o.name)).toEqual(["AIK", "UIK"]);
    expect(data?.activities.map(a => a.member.id).sort()).toEqual(["child1", "child2", "parent"]);
    expect(data?.activities.find(a => a.member.id === "child2")?.invitation?.response).toBe("declined");
    expect(data?.teams.find(t => t.team.id === "football")?.roles).toEqual(["Målsman", "Ledare"]);
    expect(state.calls).toContainEqual({ table: "invitations", field: "person_id", value: ["parent", "child1", "child2"] });
    expect(data?.activities.some(a => a.activity.id === "uncalled")).toBe(false);
  });
  it("includes a cross-team invitation and duty-only activity without granting team membership", async () => {
    state.tables.invitations.push({ id: "guest-invite", person_id: "child2", organization_id: "aik", activity_id: "guest-match", response: "pending" });
    state.tables.activities.push(activity("guest-match", "aik", "guest"), activity("cafe", "uik", "football"));
    state.tables.duties.push({ organization_id: "uik", person_id: "child1", activity_id: "cafe", team_id: "football" });
    const data = await getPersonalDashboard();
    expect(data?.activities.find(a => a.activity.id === "cafe")).toMatchObject({ hasDutyAssignment: true, invitation: undefined });
    expect(data?.activities.find(a => a.activity.id === "guest-match")?.team.id).toBe("guest");
    expect(data?.teams.some(t => t.team.id === "guest")).toBe(false);
  });
  it("hides future invitations, drafts, cancelled and ended activities; keeps declined replies", async () => {
    state.tables.activities.push({ ...activity("future", "uik", "football"), invitation_send_at: "2031-01-01T10:00:00Z" }, { ...activity("draft", "uik", "football"), status: "draft" }, { ...activity("cancelled", "uik", "football"), status: "cancelled" }, { ...activity("ended", "uik", "football"), ends_at: "2020-01-01T12:00:00Z" });
    for (const id of ["future", "draft", "cancelled", "ended"]) state.tables.invitations.push({ id, person_id: "child1", activity_id: id, organization_id: "uik", response: "pending" });
    const data = await getPersonalDashboard();
    expect(new Set(data?.activities.map(a => a.activity.id))).toEqual(new Set(["training", "match"]));
  });
  it("returns an empty personal page for a new account and does not read private data when signed out", async () => {
    state.tables = {};
    expect(await getPersonalDashboard()).toMatchObject({ activities: [], teams: [], organizations: [] });
    state.user = null;
    state.calls = [];
    expect(await getPersonalDashboard()).toBeNull();
    expect(state.calls).toEqual([]);
  });
  it("does not list ended or not-yet-started memberships as my teams", async () => {
    state.tables.memberships = [{ id: "old", person_id: "child1", team_id: "football", role: "participant", starts_on: "2020-01-01", ends_on: "2021-01-01" }, { id: "future", person_id: "child2", team_id: "floorball", role: "participant", starts_on: "2030-01-01", ends_on: null }];
    expect((await getPersonalDashboard())?.teams).toEqual([]);
  });
});

it("paginates even when the server returns fewer rows than requested", async () => {
  const page = vi.fn(async (from: number) => ({ data: [from], count: 3, error: null }));
  expect(await readPersonalPages(page)).toEqual([0, 1, 2]);
  expect(page.mock.calls.map(args => args[0])).toEqual([0, 1, 2]);
});
it("fails closed on a failed or incomplete read instead of showing an empty family calendar", async () => {
  await expect(readPersonalPages(async () => ({ data: [], count: 1, error: null }))).rejects.toThrow("fullständigt");
  await expect(readPersonalPages(async () => ({ data: null, count: null, error: new Error() }))).rejects.toThrow("kunde inte hämtas");
});
