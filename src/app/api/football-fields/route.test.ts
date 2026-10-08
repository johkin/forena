import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
import { GET, PUT } from "./route";
const teamId = "fc300000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue({ data: { user: { id: "actor" } } });
  mocks.rpc.mockResolvedValue({ data: { enabled: true, values: {}, revision: 0 }, error: null });
  mocks.client.mockResolvedValue({ auth: { getUser: mocks.auth }, rpc: mocks.rpc });
});
const put = (body: unknown) => PUT(new Request("http://localhost/api/football-fields", { method: "PUT", body: JSON.stringify(body) }));
describe("native football fields API", () => {
  it("reads without mutation arguments and disables caching", async () => {
    const response = await GET(new Request(`http://localhost/api/football-fields?teamId=${teamId}&scope=team`));
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("football_fields", { target_team_id: teamId, target_scope: "team", target_activity_id: null, target_person_id: null });
  });
  it("sends replacement values and revision to the authoritative RPC", async () => {
    const response = await put({ teamId, scope: "team", values: { gameFormat: "7v7", targetTeamSize: 9, periods: 3 }, revision: 2, captainSource: "teamPlayers", organizationId: "untrusted" });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("football_fields", expect.objectContaining({ new_values: { gameFormat: "7v7", targetTeamSize: 9, periods: 3 }, expected_revision: 2 }));
    expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty("organizationId");
  });
  it("saves the source as a football activity value", async () => {
    const response = await put({ teamId, scope: "activity", activityId: teamId,
      values: { captainSource: "teamPlayers", captainPersonId: teamId }, revision: 1 });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("football_fields", expect.objectContaining({
      new_values: { captainSource: "teamPlayers", captainPersonId: teamId }, expected_revision: 1,
    }));
  });
  it("does not add captain metadata to an activity-only editor's values", async () => {
    expect((await put({ teamId, scope: "activity", activityId: teamId, values: { periods: 2 }, revision: 1 })).status).toBe(200);
    expect(mocks.rpc.mock.calls[0][1].new_values).toEqual({ periods: 2 });
  });
  it("rejects conflicting structured and legacy sources", async () => {
    expect((await put({ teamId, scope: "activity", activityId: teamId,
      values: { captainSource: "teamPlayers" }, captainSource: "acceptedActivityPlayers", revision: 1 })).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("never calls the database command without a signed-in user", async () => {
    mocks.auth.mockResolvedValue({ data: { user: null } });
    expect((await GET(new Request(`http://localhost/api/football-fields?teamId=${teamId}&scope=team`))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([{ shirtNumber: -1 }, { shirtNumber: 1.5 }, { shirtNumber: "7" }, { captainPersonId: "not-a-uuid" }, { arbitrary: 1 }])("rejects invalid or misplaced fields %j", async values => {
    expect((await put({ teamId, scope: "teamMembership", personId: teamId, values, revision: 0, captainSource: "teamPlayers" })).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([["40001",409],["42501",403],["P0002",404],["55000",409],["22023",400]])("maps SQL %s safely", async (code,status) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: "private SQL details" } });
    const response = await put({ teamId, scope: "team", values: {}, revision: 0, captainSource: "teamPlayers" });
    expect(response.status).toBe(status); expect(await response.text()).not.toContain("private SQL");
  });
});
