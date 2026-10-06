import { beforeEach, expect, it, vi } from "vitest";
const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
import { GET } from "./route";
const id = "00000000-0000-4000-8000-000000000001";
const request = new Request("https://test");
const props = { params: Promise.resolve({ activityId: id }) };
function setup({ user = true, allowed = true, visible = true, permissionError = false } = {}) {
  const queries: { table: string; columns: string; filters: [string, string][] }[] = [];
  const rows = {
    activities: visible ? { id, organization_id: "other-org", team_id: "other-team", activity_type_id: "type", title: "Historisk träning", description_markdown: "Instruktion", starts_at: "2026-09-01T14:15:00Z", ends_at: "2026-09-01T15:15:00Z", location: "IP", status: "published", gathering_at: null, series_id: null, response_due_at: null } : null,
    organizations: { id: "other-org", slug: "other", name: "Klubb", time_zone: "Europe/Stockholm", assistant_name: "Assistent" },
    teams: { id: "other-team", organization_id: "other-org", slug: "team", name: "Lag", section_id: "section", season: "2026" },
  };
  const rpc = vi.fn(async () => ({ data: allowed, error: permissionError ? { message: "failed" } : null }));
  const from = vi.fn((table: keyof typeof rows) => ({ select: (columns: string) => {
    const query = { table, columns, filters: [] as [string, string][] }; queries.push(query);
    const builder = { eq: (key: string, value: string) => { query.filters.push([key, value]); return builder; }, maybeSingle: async () => ({ data: rows[table], error: null }), single: async () => ({ data: rows[table], error: null }) };
    return builder;
  } }));
  createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: user ? { id: "caller" } : null } }) }, from, rpc });
  return { rpc, from, queries };
}
beforeEach(() => vi.clearAllMocks());
it("requires authentication before looking up details", async () => {
  const { from } = setup({ user: false });
  expect((await GET(request, props)).status).toBe(401);
  expect(from).not.toHaveBeenCalled();
});
it("does not reveal an RLS-hidden activity", async () => {
  const { rpc } = setup({ visible: false });
  expect((await GET(request, props)).status).toBe(404);
  expect(rpc).not.toHaveBeenCalled();
});
it.each([false, true])("rejects denied or failed target-team checks (error=%s)", async permissionError => {
  const { queries, rpc } = setup({ allowed: permissionError, permissionError });
  expect((await GET(request, props)).status).toBe(403);
  expect(queries.map(q => q.table)).toEqual(["activities"]);
  expect(rpc.mock.calls).toHaveLength(3);
});
it("checks the activity's own team and returns only its actual context", async () => {
  const { rpc, queries } = setup();
  const response = await GET(request, props);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ activity: { id, teamId: "other-team", organizationId: "other-org" }, team: { id: "other-team" }, organization: { timeZone: "Europe/Stockholm" } });
  expect(rpc).toHaveBeenCalledWith("has_team_permission", { target_team_id: "other-team", target_permission: "attendance.manage" });
  expect(queries.map(q => q.table)).toEqual(["activities", "organizations", "teams"]);
  expect(queries[2].filters).toContainEqual(["organization_id", "other-org"]);
});
