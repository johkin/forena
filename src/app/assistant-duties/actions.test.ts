import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc, auth: { getUser: mocks.getUser } }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { confirmAssistantDuties } from "./actions";
const value = { teamId: "a3000000-0000-0000-0000-000000000001", fingerprint: "a".repeat(32), command: { activityIds: ["a6000000-0000-0000-0000-000000000001"], name: "Sekretariat", places: 2, instructions: "" } };
beforeEach(() => { vi.clearAllMocks(); mocks.getUser.mockResolvedValue({ data: { user: { id: "user" } }, error: null }); });
it("rejects invalid input and missing sessions without writes", async () => {
  expect(await confirmAssistantDuties({ ...value, approved: true })).toHaveProperty("saved", false);
  expect(mocks.getUser).not.toHaveBeenCalled();
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect(await confirmAssistantDuties(value)).toHaveProperty("saved", false);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("sends only the reviewed command and fingerprint to the atomic RPC", async () => {
  mocks.rpc.mockResolvedValue({ data: { created: 3, skipped: 1 }, error: null });
  expect(await confirmAssistantDuties(value)).toEqual({ saved: true, created: 3, skipped: 1 });
  expect(mocks.rpc).toHaveBeenCalledWith("confirm_activity_duty_batch", { target_team_id: value.teamId, command: value.command, expected_fingerprint: value.fingerprint });
  expect(mocks.revalidate).toHaveBeenCalled();
});
it.each(["42501", "40001", "23514"])("does not claim success on %s", async code => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code } });
  expect(await confirmAssistantDuties(value)).toHaveProperty("saved", false);
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
