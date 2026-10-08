import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BASE_DISCIPLINE_DEFAULTS } from "@/lib/discipline-defaults";

const mocks = vi.hoisted(() => ({ client: vi.fn(), type: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/activity-configuration", () => ({ requireActivityType: mocks.type }));
import { POST } from "./route";

function setup() {
  const inserts: Record<string, unknown[]> = {};
  const from = vi.fn((table: string) => {
    let inserted: unknown;
    const result = () => ({ data: table === "teams" ? { id: "team", organization_id: "org" }
      : table === "organizations" ? { time_zone: "Europe/Stockholm" }
      : table === "activities" ? { ...(inserted as object), id: "activity" } : [], error: null });
    const builder = {
      select: vi.fn(), eq: vi.fn(),
      insert: vi.fn((value: unknown) => { inserted = value; (inserts[table] ??= []).push(value); return builder; }),
      maybeSingle: vi.fn(async () => result()), single: vi.fn(async () => result()),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    builder.select.mockReturnValue(builder); builder.eq.mockReturnValue(builder);
    return builder;
  });
  mocks.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "user" } } }) },
    from, rpc: vi.fn(async () => ({ data: true, error: null })) });
  mocks.type.mockResolvedValue({ id: "training" });
  return inserts;
}
const body = { teamId: "team", activityTypeId: "training", title: "Träning", startsAt: "2026-10-09T14:15:00Z", endsAt: "2026-10-09T15:15:00Z",
  invitationMode: "schedule", invitationAudience: "players", timingRules: { ...BASE_DISCIPLINE_DEFAULTS,
    duration: "PT60M", gatheringRule: "start", invitationRule: "start-6d", responseDueRule: "start-6h", reminderRules: ["deadline-5d", "deadline-2d"] } };
const request = (value: object) => new Request("http://localhost/api/activities", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-06T10:00:00Z")); });
afterEach(() => vi.useRealTimers());

it("creates a single activity with a due-now invitation and only future reminders", async () => {
  const inserts = setup();
  const response = await POST(request(body));
  expect(response.status).toBe(201);
  expect(inserts.activities[0]).toMatchObject({ invitation_send_at: "2026-10-06T10:00:00.000Z", response_due_at: "2026-10-09T08:15:00.000Z",
    reminder_send_ats: ["2026-10-07T08:15:00.000Z"], invitation_audience_kind: "players" });
  expect((await response.json()).activity.invitation_send_at).toBe("2026-10-06T10:00:00.000Z");
});
it("keeps a future invitation time unchanged", async () => {
  const inserts = setup();
  vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
  expect((await POST(request(body))).status).toBe(201);
  expect(inserts.activities[0]).toMatchObject({ invitation_send_at: "2026-10-03T14:15:00.000Z", reminder_send_ats: ["2026-10-04T08:15:00.000Z", "2026-10-07T08:15:00.000Z"] });
});
it("rejects an elapsed answer deadline before creating the activity", async () => {
  const inserts = setup();
  vi.setSystemTime(new Date("2026-10-09T08:15:00Z"));
  const response = await POST(request(body));
  expect(response.status).toBe(400);
  expect(await response.json()).toHaveProperty("error", expect.stringContaining("Sista svarstid har passerat"));
  expect(inserts).toEqual({});
});
