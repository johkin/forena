import { expect, it, vi } from "vitest";
import type { AssistantDependencies } from "./team-assistant-types";
import { createWorkspaceMemberTools } from "./workspace-member-tools";

const scope = { organizationId: "club", organizationName: "Klubben", teams: [{ id: "a", name: "F2016" }, { id: "b", name: "F2013" }], today: "2026-10-07" };
type Row = Record<string, string | null>;
function setup(options: { denied?: string[]; errorTable?: string; missingPerson?: boolean; cap?: number; member?: boolean } = {}) {
  const rows: Record<string, Row[]> = {
    memberships: [
      { id: "1", organization_id: "club", team_id: "a", person_id: "p", role: "participant", starts_on: "2026-01-01", ends_on: null },
      { id: "2", organization_id: "club", team_id: "b", person_id: "p", role: "participant", starts_on: "2026-01-01", ends_on: "2026-10-07" },
      { id: "3", organization_id: "club", team_id: "a", person_id: "l", role: "leader", starts_on: "2026-01-01", ends_on: null },
      { id: "4", organization_id: "club", team_id: "b", person_id: "p", role: "leader", starts_on: "2026-01-01", ends_on: null },
      { id: "5", organization_id: "other", team_id: "a", person_id: "x", role: "leader", starts_on: "2026-01-01", ends_on: null },
      { id: "6", organization_id: "club", team_id: "a", person_id: "future", role: "participant", starts_on: "2026-10-08", ends_on: null },
      { id: "7", organization_id: "club", team_id: "a", person_id: "old", role: "leader", starts_on: "2026-01-01", ends_on: "2026-10-06" },
    ],
    team_responsibilities: [
      { id: "r1", organization_id: "club", team_id: "a", person_id: "l", responsibility_type_id: "cash", starts_on: "2026-01-01", ends_on: null },
      { id: "r2", organization_id: "club", team_id: "b", person_id: "l", responsibility_type_id: "cash", starts_on: "2026-01-01", ends_on: null },
      { id: "r3", organization_id: "club", team_id: "b", person_id: "p", responsibility_type_id: "custom", starts_on: "2026-01-01", ends_on: null },
    ],
    responsibility_types: [{ id: "cash", organization_id: "club", name: "Kassör", slug: "kassor" }, { id: "custom", organization_id: "club", name: "Materialansvarig", slug: "material" }],
    people: [{ id: "p", organization_id: "club", display_name: "Spelaren" }, ...options.missingPerson ? [] : [{ id: "l", organization_id: "club", display_name: "Ledaren" }]],
  };
  const reads: { table: string; columns: string; pages: number }[] = [];
  const rpc = vi.fn(async (name: string, args: { target_team_id?: string }) => ({ error: null, data: name === "is_organization_member" ? options.member !== false : !options.denied?.includes(args.target_team_id!) }));
  const supabase = { rpc, from: vi.fn((table: string) => {
    let filtered = [...rows[table]];
    const record = { table, columns: "", pages: 0 }; reads.push(record);
    const query = {
      select: (columns: string) => { record.columns = columns; return query; },
      eq: (key: string, value: string) => { filtered = filtered.filter(r => r[key] === value); return query; },
      in: (key: string, values: string[]) => { filtered = filtered.filter(r => values.includes(r[key]!)); return query; },
      lte: (key: string, value: string) => { filtered = filtered.filter(r => r[key]! <= value); return query; },
      or: () => { filtered = filtered.filter(r => !r.ends_on || r.ends_on >= scope.today); return query; },
      order: () => query,
      range: async (from: number, through: number) => { record.pages++; return { data: filtered.slice(from, Math.min(through + 1, from + (options.cap ?? 200))), count: filtered.length, error: options.errorTable === table ? { code: "failed" } : null }; },
    }; return query;
  }) };
  const answer = vi.fn();
  const dependencies = { supabase: supabase as unknown as AssistantDependencies["supabase"], userId: "user" };
  const tools = createWorkspaceMemberTools(dependencies, scope, answer);
  const read = (args: { mode: "summary" | "list"; role?: "participant" | "leader"; teamId?: string; responsibilityTypeId?: string }) => tools.readWorkspaceMembers.execute!(args, {} as never);
  return { read, tools, reads, rpc, answer, dependencies, rows };
}
it("counts unique people per role, active on the local date, within the organization", async () => {
  const { read, reads, answer } = setup();
  expect(await read({ mode: "summary" })).toMatchObject({ scope: "Klubben", complete: true, summary: { uniquePeople: 2, players: 1, leaders: 2 }, members: [] });
  expect(reads.map(r => r.table)).not.toContain("people");
  expect(answer).toHaveBeenCalledWith(expect.stringContaining("1 spelare och 2 ledare"));
});
it("reads every page even when the database row cap is below the requested page size", async () => {
  const { read, reads } = setup({ cap: 1 });
  expect(await read({ mode: "summary" })).toMatchObject({ summary: { players: 1, leaders: 2 } });
  expect(reads.find(r => r.table === "memberships")!.pages).toBe(4);
});
it("lists all team assignments of a cashier, including a person without membership in that team", async () => {
  const { read, reads } = setup();
  expect(await read({ mode: "list", responsibilityTypeId: "cash" })).toMatchObject({ summary: { uniquePeople: 1 }, members: [{ name: "Ledaren", team: "F2013", responsibilities: ["Kassör"] }, { name: "Ledaren", team: "F2016", roles: ["ledare"] }], truncated: false });
  expect(reads.find(r => r.table === "people")!.columns).toBe("id, display_name");
});
it("filters on custom responsibility types and membership roles independently", async () => {
  const { read } = setup();
  expect(await read({ mode: "list", responsibilityTypeId: "custom", role: "participant" })).toMatchObject({ members: [{ name: "Spelaren", team: "F2013", roles: ["spelare", "ledare"], responsibilities: ["Materialansvarig"] }] });
});
it("labels partial coverage and never reads the denied team's memberships", async () => {
  const { read, answer } = setup({ denied: ["b"] });
  expect(await read({ mode: "summary" })).toMatchObject({ complete: false, includedTeamCount: 1, requestedTeamCount: 2, teams: ["F2016"], summary: { players: 1, leaders: 1 } });
  expect(answer).toHaveBeenCalledWith(expect.stringContaining("inte en total"));
});
it("rejects outside-scope IDs, unknown types and nonmembers without returning counts", async () => {
  const { read } = setup();
  expect(await read({ mode: "summary", teamId: "other-section" })).toHaveProperty("error");
  expect(await read({ mode: "summary", responsibilityTypeId: "other-club" })).toHaveProperty("error");
  expect(await setup({ member: false }).read({ mode: "summary" })).toHaveProperty("error");
});
it("rechecks permissions on each call, including a specific denied team", async () => {
  const { read, rpc } = setup({ denied: ["b"] });
  await read({ mode: "summary" });
  expect(await read({ mode: "summary", teamId: "b" })).toHaveProperty("error");
  expect(rpc.mock.calls.filter(([name]) => name === "is_organization_member")).toHaveLength(2);
});
it("fails closed on database errors or incomplete names instead of reporting zero or omitting people", async () => {
  expect(await setup({ errorTable: "memberships" }).read({ mode: "summary" })).toHaveProperty("error");
  expect(await setup({ missingPerson: true }).read({ mode: "list" })).toHaveProperty("error");
});
it("keeps section reads confined to server-resolved teams", async () => {
  const { dependencies } = setup();
  const tools = createWorkspaceMemberTools(dependencies, { ...scope, sectionName: "Fotboll", teams: [scope.teams[0]] }, vi.fn());
  expect(await tools.readWorkspaceMembers.execute!({ mode: "summary" }, {} as never)).toMatchObject({ scope: "Fotboll i Klubben", complete: true, summary: { leaders: 1 }, teams: ["F2016"] });
  expect(await tools.readWorkspaceMembers.execute!({ mode: "summary", teamId: "b" }, {} as never)).toHaveProperty("error");
});

it("keeps complete totals when the detail list is truncated", async () => {
  const { read, rows } = setup();
  rows.memberships = Array.from({ length: 201 }, (_, i) => ({ id: String(i), organization_id: "club", team_id: "a", person_id: `p${i}`, role: "participant", starts_on: "2026-01-01", ends_on: null }));
  rows.team_responsibilities = [];
  rows.people = rows.memberships.map(m => ({ id: m.person_id, organization_id: "club", display_name: m.person_id }));
  expect(await read({ mode: "list" })).toMatchObject({ summary: { players: 201, leaders: 0 }, truncated: true, matchingPersonTeamCount: 201 });
});
it("returns verified zero for empty accessible teams", async () => {
  const { read, rows } = setup();
  rows.memberships = []; rows.team_responsibilities = [];
  expect(await read({ mode: "summary" })).toMatchObject({ complete: true, summary: { uniquePeople: 0, players: 0, leaders: 0 } });
});
