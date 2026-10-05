import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), auth: vi.fn(), queue: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/activity-reminders", () => ({ queueConfirmedActivityReminder: mocks.queue }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { confirmAssistantReminder } from "./actions";
const confirmation = { teamId: "30000000-0000-4000-8000-000000000001", activityId: "30000000-0000-4000-8000-000000000002", fingerprint: "a".repeat(64) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ data: { user: { id: "user" } }, error: null });
  mocks.client.mockResolvedValue({ auth: { getUser: mocks.auth } });
  mocks.queue.mockResolvedValue({ queuedRecipients: 2 });
});
it("rejects malformed confirmations before accessing data", async () => {
  expect(await confirmAssistantReminder({ ...confirmation, teamId: "other" })).toMatchObject({ queued: false });
  expect(mocks.client).not.toHaveBeenCalled();
});
it("requires a fresh authenticated user before queueing", async () => {
  mocks.auth.mockResolvedValue({ data: { user: null }, error: null });
  expect(await confirmAssistantReminder(confirmation)).toMatchObject({ queued: false });
  expect(mocks.queue).not.toHaveBeenCalled();
});
it("delegates to the revalidating command and refreshes the team page", async () => {
  expect(await confirmAssistantReminder(confirmation)).toEqual({ queued: true, queuedRecipients: 2 });
  expect(mocks.queue).toHaveBeenCalledWith(expect.anything(), confirmation.teamId, confirmation.activityId, confirmation.fingerprint);
  expect(mocks.revalidate).toHaveBeenCalledWith("/o/[organizationSlug]/t/[teamSlug]", "page");
});
it("returns stale-preview or permission errors without reporting success", async () => {
  mocks.queue.mockRejectedValue(new Error("Kallelseläget har ändrats"));
  expect(await confirmAssistantReminder(confirmation)).toEqual({ queued: false, error: "Kallelseläget har ändrats" });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
