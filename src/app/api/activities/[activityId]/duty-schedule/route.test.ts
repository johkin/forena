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
