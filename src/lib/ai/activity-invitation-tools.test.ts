import { expect, it, vi } from "vitest";
import { createActivityInvitationTools } from "./activity-invitation-tools";
import { invitationFixture } from "./__fixtures__/activity-invitations";
const source = "00000000-0000-4000-8000-000000000001", target = "00000000-0000-4000-8000-000000000002";
const options = {} as never;

it("counts unique source players and all responses across upcoming host-team trainings", async () => {
  const { tools, onResult } = invitationFixture();
  const result = await tools.readActivityInvitations.execute!({ targetTeamId: target, category: "session", response: "all" }, options);
  expect(result).toMatchObject({ sourceTeam: "F2016", team: "F2013", kind: "invitations", periodMode: "upcoming", summary: { uniquePeople: 3, participationCount: 4 }, activityCount: 2 });
  expect(onResult).toHaveBeenCalledOnce();
  expect(result).not.toHaveProperty("records");
});
it("filters accepted replies separately from all invitations", async () => {
  const { tools } = invitationFixture();
  expect(await tools.readActivityInvitations.execute!({ targetTeamId: target, category: "session", response: "accepted" }, options)).toMatchObject({ summary: { uniquePeople: 1, participationCount: 2 }, invitationResponse: "accepted" });
});
it("never reports zero when target permission is denied", async () => {
  const { tools, from, onResult } = invitationFixture(false);
  expect(await tools.readActivityInvitations.execute!({ targetTeamId: target, category: "session", response: "all" }, options)).toHaveProperty("error");
  expect(from).not.toHaveBeenCalled(); expect(onResult).not.toHaveBeenCalled();
});
it("rejects an unlisted cross-organization team before reading tables", async () => {
  const { tools, from } = invitationFixture();
  expect(await tools.readActivityInvitations.execute!({ targetTeamId: "00000000-0000-4000-8000-000000000003", category: "session", response: "all" }, options)).toHaveProperty("error");
  expect(from).not.toHaveBeenCalled();
});
it("returns an error rather than fabricated totals on a read failure", async () => {
  const { tools, from, onResult } = invitationFixture();
  from.mockImplementation(() => { throw new Error("read failed"); });
  expect(await tools.readActivityInvitations.execute!({ targetTeamId: target, category: "session", response: "all" }, options)).toHaveProperty("error");
  expect(onResult).not.toHaveBeenCalled();
});
it("reads beyond PostgREST's first page", async () => {
  const { tools, tables, queries } = invitationFixture();
  tables.memberships = Array.from({ length: 501 }, (_, n) => ({ ...tables.memberships[0], id: String(n), person_id: n === 500 ? "Tilda" : `player${n}` }));
  expect(await tools.readActivityInvitations.execute!({ targetTeamId: target, category: "session", response: "all" }, options)).toMatchObject({ summary: { uniquePeople: 1, participationCount: 2 } });
  expect(queries.find(q => q.table === "memberships")?.ranges).toEqual([[0, 499], [500, 999]]);
});
it("uses the explicit calendar period instead of the upcoming default", async () => {
  const { supabase } = invitationFixture();
  const tools = createActivityInvitationTools(supabase, "org", source, { today: "2026-10-07", now: "2026-10-07T10:00:00Z", timeZone: "Europe/Stockholm", period: { from: "2026-09-01", through: "2026-09-30" }, onResult: vi.fn() });
  expect(await tools.readActivityInvitations.execute!({ targetTeamId: target, category: "session", response: "all" }, options)).toMatchObject({ periodMode: "explicit", from: "2026-09-01", through: "2026-09-30", summary: { uniquePeople: 1, participationCount: 1 } });
});

it("uses source membership on the activity date, not today's membership", async () => {
  const { supabase, tables } = invitationFixture();
  tables.memberships[0].ends_on = "2026-09-30";
  const tools = createActivityInvitationTools(supabase, "org", source, { today: "2026-10-07", now: "2026-10-07T10:00:00Z", timeZone: "Europe/Stockholm", period: { from: "2026-09-01", through: "2026-09-30" }, onResult: vi.fn() });
  expect(await tools.readActivityInvitations.execute!({ targetTeamId: target, category: "session", response: "all" }, options)).toMatchObject({ summary: { uniquePeople: 1, participationCount: 1 } });
});
it("does not replace an unavailable named team with an available team", async () => {
  const { supabase, from } = invitationFixture();
  const tools = createActivityInvitationTools(supabase, "org", source, { today: "2026-10-07", now: "2026-10-07T10:00:00Z", timeZone: "Europe/Stockholm", question: "Hur många från F2016 är kallade med F2010?", onResult: vi.fn() });
  expect(await tools.readActivityInvitations.execute!({ targetTeamId: target, category: "session", response: "all" }, options)).toHaveProperty("error");
  expect(from).not.toHaveBeenCalled();
});

it("can count one explicitly selected activity without counting the rest of the series", async () => {
  const { tools, tables } = invitationFixture();
  const activityId = "00000000-0000-4000-8000-000000000004";
  tables.activities[0].id = activityId;
  for (const invitation of tables.invitations) if (invitation.activity_id === "a") invitation.activity_id = activityId;
  expect(await tools.readActivityInvitations.execute!({ targetTeamId: target, activityId, category: "session", response: "all" }, options)).toMatchObject({ activityCount: 1, summary: { uniquePeople: 3, participationCount: 3 } });
});
it("does not report zero for a selected activity outside the target team", async () => {
  const { tools, onResult } = invitationFixture();
  expect(await tools.readActivityInvitations.execute!({ targetTeamId: target, activityId: "00000000-0000-4000-8000-000000000004", category: "session", response: "all" }, options)).toHaveProperty("error");
  expect(onResult).not.toHaveBeenCalled();
});
it("requires source-team permission as well as host-team permission", async () => {
  const { tools, rpc, from } = invitationFixture();
  rpc.mockResolvedValue({ data: [{ id: source, name: "F2016", canReadWork: false }, { id: target, name: "F2013", canReadWork: true }], error: null });
  expect(await tools.readActivityInvitations.execute!({ targetTeamId: target, category: "session", response: "all" }, options)).toHaveProperty("error");
  expect(from).not.toHaveBeenCalled();
});
it("asks for a supported explicit period rather than silently reading upcoming events", async () => {
  const { supabase, from } = invitationFixture();
  const tools = createActivityInvitationTools(supabase, "org", source, { today: "2026-10-07", now: "2026-10-07T10:00:00Z", timeZone: "Europe/Stockholm", periodRequired: true, onResult: vi.fn() });
  expect(await tools.readActivityInvitations.execute!({ targetTeamId: target, category: "session", response: "all" }, options)).toHaveProperty("error");
  expect(from).not.toHaveBeenCalled();
});
