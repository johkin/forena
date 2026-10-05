import { describe, expect, it, vi } from "vitest";
import { assessActivityReminder, queueConfirmedActivityReminder } from "./activity-reminders";
import type { AssistantDependencies } from "./ai/team-assistant-types";

const now = new Date("2026-10-05T10:00:00Z");
function setup({ allowed = true, status = "published", startsAt = "2099-10-07T16:00:00Z", lastReminderAt = null as string | null,
  responses = [{ person_id: "player", response: "accepted" }, { person_id: "leader", response: "accepted" }, { person_id: "pending-player", response: "pending" }],
  readError = false, queueError = false, missingActivity = false } = {}) {
  const queries: { table: string; eq: ReturnType<typeof vi.fn> }[] = [];
  const from = vi.fn((table: string) => {
    const data = {
      activities: missingActivity ? null : { id: "activity", title: "Match", activity_type_id: "match", starts_at: startsAt, response_due_at: "2099-10-06T16:00:00Z", status },
      invitations: responses,
      activity_types: { name: "Match" },
      activity_events: lastReminderAt ? { created_at: lastReminderAt } : null,
      memberships: [{ person_id: "player" }, { person_id: "pending-player" }],
    }[table];
    const result = { data, error: readError && table === "invitations" ? { message: "unavailable" } : null };
    const builder = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), is: vi.fn(), order: vi.fn(), limit: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue(result), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) };
    for (const method of [builder.select, builder.eq, builder.in, builder.is, builder.order, builder.limit]) method.mockReturnValue(builder);
    queries.push({ table, eq: builder.eq });
    return builder;
  });
  const rpc = vi.fn((name: string) => Promise.resolve(name === "has_team_permission"
    ? { data: allowed, error: null }
    : { data: queueError ? null : 2, error: queueError ? { message: "forbidden" } : null }));
  const client = { from, rpc } as unknown as AssistantDependencies["supabase"];
  return { client, from, rpc, queries };
}

describe("reminder assessment and confirmation", () => {
  it("checks invitation.manage before reading any activity or response", async () => {
    const { client, rpc, from } = setup({ allowed: false });
    await expect(assessActivityReminder(client, "team", "activity", now)).rejects.toThrow("behörighet");
    expect(rpc).toHaveBeenCalledWith("has_team_permission", { target_team_id: "team", target_permission: "invitation.manage" });
    expect(from).not.toHaveBeenCalled();
  });
  it("scopes activity lookup to the team and distinguishes players from leaders", async () => {
    const { client, rpc, queries } = setup();
    expect(await assessActivityReminder(client, "team", "activity", now)).toMatchObject({ accepted: 2, acceptedPlayers: 1, pendingPlayers: 1, pending: 1, canRemind: true });
    expect(queries[0].eq).toHaveBeenCalledWith("team_id", "team");
    expect(rpc).not.toHaveBeenCalledWith("queue_activity_reminder", expect.anything());
  });
  it("rejects an activity outside the selected team", async () => {
    const { client, from } = setup({ missingActivity: true });
    await expect(assessActivityReminder(client, "team", "activity", now)).rejects.toThrow("aktuella laget");
    expect(from).not.toHaveBeenCalledWith("invitations");
  });
  it.each([{ status: "cancelled" }, { status: "draft" }, { startsAt: now.toISOString() }, { responses: [] }, { lastReminderAt: "2026-10-05T09:30:00Z" }])("blocks ineligible reminders: %j", async options => {
    const { client } = setup(options);
    expect((await assessActivityReminder(client, "team", "activity", now)).canRemind).toBe(false);
  });
  it("fails closed if response or history reads fail", async () => {
    const { client } = setup({ readError: true });
    await expect(assessActivityReminder(client, "team", "activity", now)).rejects.toThrow("kunde inte läsas");
  });
  it("requires a new preview if a recipient changed even when counts are unchanged", async () => {
    const original = setup();
    const preview = await assessActivityReminder(original.client, "team", "activity");
    const changed = setup({ responses: [{ person_id: "other-player", response: "accepted" }, { person_id: "leader", response: "accepted" }, { person_id: "pending-player", response: "pending" }] });
    await expect(queueConfirmedActivityReminder(changed.client, "team", "activity", preview.fingerprint)).rejects.toThrow("ändrats");
    expect(changed.rpc).not.toHaveBeenCalledWith("queue_activity_reminder", expect.anything());
  });
  it("queues via the existing permission checked command after revalidation", async () => {
    const { client, rpc } = setup();
    const preview = await assessActivityReminder(client, "team", "activity");
    expect(await queueConfirmedActivityReminder(client, "team", "activity", preview.fingerprint)).toEqual({ queuedRecipients: 2 });
    expect(rpc).toHaveBeenCalledWith("queue_activity_reminder", { target_activity_id: "activity" });
  });
  it("does not report a failed queue as success", async () => {
    const { client } = setup({ queueError: true });
    const preview = await assessActivityReminder(client, "team", "activity");
    await expect(queueConfirmedActivityReminder(client, "team", "activity", preview.fingerprint)).rejects.toThrow("kunde inte köas");
  });
});
