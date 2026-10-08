import { beforeEach, expect, it, vi } from "vitest";
import { footballPackage } from "@/disciplines/football/definition";

const { rpc, getUser } = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc, auth: { getUser } }) }));
import { POST } from "./route";
const signalId = "fa800000-0000-4000-8000-000000000001";
const post = (action = "remind-unanswered", revision = 1) => POST(new Request("http://localhost/api/signals/" + signalId, {
  method: "POST", body: JSON.stringify({ action, revision }),
}), { params: Promise.resolve({ signalId }) });
const context = {
  activityId: "match", revision: 8, signalRevision: 1, disciplineKey: "football", capabilityId: "targetTeamSize", type: "team_size_shortage",
  contexts: [{ activityId: "match", teamId: "team", organizationId: "club", disciplineKey: "football", currentDisciplineKey: "football",
    disciplineVersion: "1.0.0", definition: footballPackage.capabilities[0], values: { targetTeamSize: 9 },
    evaluatedAt: "2026-10-08T12:00:00Z", startsAt: "2026-10-10T12:00:00Z", responseDueAt: null,
    title: "Match", status: "published", sourceKind: "manual", activityTypeSlug: "match-tavling", category: "competition",
    acceptedPlayers: 6, pendingPlayers: 4, invitedPlayers: 10, completedCheckpoints: [] }],
};
beforeEach(() => {
  vi.clearAllMocks(); getUser.mockResolvedValue({ data: { user: { id: "user" } } });
  rpc.mockImplementation(async name => ({ data: name === "capability_signal_action_context" ? context : 4, error: null }));
});
it("executes the reminder only after fresh capability evaluation and with both revision guards", async () => {
  expect((await post()).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("remind_capability_signal", { target_signal_id: signalId, expected_signal_revision: 1, expected_input_revision: 8 });
});
it("rejects a resolved shortage even before the stored signal is reconciled", async () => {
  rpc.mockResolvedValue({ data: { ...context, contexts: [{ ...context.contexts[0], acceptedPlayers: 9 }] }, error: null });
  expect((await post()).status).toBe(409);
  expect(rpc).toHaveBeenCalledTimes(1);
});
it("rejects a stale UI revision", async () => {
  expect((await post("remind-unanswered", 2)).status).toBe(409);
  expect(rpc).toHaveBeenCalledTimes(1);
});
it("rejects an unauthenticated caller before reading facts", async () => {
  getUser.mockResolvedValue({ data: { user: null } });
  expect((await post()).status).toBe(401); expect(rpc).not.toHaveBeenCalled();
});
it("maps denied team access to 403 without executing the command", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
  expect((await post()).status).toBe(403); expect(rpc).toHaveBeenCalledTimes(1);
});
it("dismisses through the authenticated, revisioned command", async () => {
  expect((await post("dismiss")).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("dismiss_capability_signal", { target_signal_id: signalId, expected_revision: 1 });
});
