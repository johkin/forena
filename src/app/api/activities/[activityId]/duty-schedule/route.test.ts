import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
import { POST } from "./route";
const activityId = "a6000000-0000-4000-8000-000000000001";
const command = { op: "cancel_duties", duties: [{ dutyId: "a8000000-0000-4000-8000-000000000001", revision: 3 }] };
const post = (body: unknown) => POST(new Request("https://example.test", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ activityId }) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockResolvedValue({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "leader" } } });
  mocks.rpc.mockResolvedValue({ data: { duties: [] }, error: null });
});
it("requires login before any cancellation", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  expect((await post(command)).status).toBe(401); expect(mocks.rpc).not.toHaveBeenCalled();
});
it("sends the selection to one atomic RPC", async () => {
  const response = await post(command);
  expect(response.status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("cancel_activity_duties", { target_activity_id: activityId, duties: command.duties });
});
it("rejects duplicate or unversioned selections without writing", async () => {
  for (const duties of [[command.duties[0], command.duties[0]], [{ dutyId: command.duties[0].dutyId }], []]) {
    expect((await post({ op: "cancel_duties", duties })).status).toBe(400);
  }
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([["42501", 403], ["40001", 409], ["23514", 409]])("reports rejected bulk cancellation %s", async (code, status) => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.rpc.mockResolvedValue({ data: null, error: { code } });
  expect((await post(command)).status).toBe(status);
  log.mockRestore();
});
it("keeps single-duty cancellation on the existing RPC", async () => {
  const input = { op: "cancel_duty", ...command.duties[0] };
  await post(input);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("command_activity_duty", { target_activity_id: activityId, command: input });
});

it.each(["create_series", "edit_series", "cancel_series"])("routes %s through one series command", async op => {
  const input = op === "create_series" ? { op, dutyTypeId: command.duties[0].dutyId, definition: { timingKind: "none", places: 3 } }
    : op === "edit_series" ? { op, seriesId: command.duties[0].dutyId, revision: 3, definition: { timingKind: "none", places: 3 } }
    : { op, seriesId: command.duties[0].dutyId, revision: 3 };
  expect((await post(input)).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("command_activity_duty_series", expect.objectContaining({ target_activity_id: activityId, command: expect.objectContaining({ op }) }));
});

const assignment = { slotId: "a1000000-0000-4000-8000-000000000001", personId: "b2000000-0000-7000-3000-000000000001", revision: 1 };
it("accepts stored PostgreSQL GUIDs for a complete assignment proposal", async () => {
  const input = { op: "assign_batch", assignments: [assignment, { ...assignment, slotId: "a1000000-0000-0000-0000-000000000002", personId: "b2000000-0000-0000-0000-000000000002" }] };
  expect((await post(input)).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("command_activity_duty", { target_activity_id: activityId, command: input });
});
it.each(["assign", "claim"])("also accepts the same person IDs for %s", async op => {
  const input = op === "assign" ? { op, ...assignment } : { op, personId: assignment.personId, targetSlotId: assignment.slotId };
  expect((await post(input)).status).toBe(200);
});
it.each([
  [{ ...assignment, personId: "not-an-id" }, "Spelarreferensen"],
  [{ ...assignment, slotId: "bad-slot" }, "Platsreferensen"],
  [{ ...assignment, revision: 0 }, "versionsuppgift"],
  [{ ...assignment, revision: undefined }, "versionsuppgift"],
])("rejects malformed assignments with an actionable error", async (invalid, detail) => {
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const response = await post({ op: "assign_batch", assignments: [invalid] });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain(detail);
    expect(body.error).toContain("Inget har sparats");
    expect(body.error).not.toContain("tider");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain(assignment.personId);
  } finally { log.mockRestore(); }
});
it("requires authentication for batch assignment", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  expect((await post({ op: "assign_batch", assignments: [assignment] })).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([["42501", 403], ["40001", 409]])("preserves permission and revision rejection for assignments: %s", async (code, status) => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    mocks.rpc.mockResolvedValue({ data: null, error: { code } });
    expect((await post({ op: "assign_batch", assignments: [assignment] })).status).toBe(status);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  } finally { log.mockRestore(); }
});
