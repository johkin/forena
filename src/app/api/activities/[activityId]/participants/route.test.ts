import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({ context: vi.fn(), add: vi.fn() }));
vi.mock("@/lib/activity-management-context", () => ({ activityManagementContext: mocks.context }));
vi.mock("@/lib/activity-participation", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/activity-participation")>(), addActivityParticipants: mocks.add }));
import { GET, POST } from "./route";
const params = { params: Promise.resolve({ activityId: "activity" }) };
const personId = "a5000000-0000-4000-8000-000000000001";
beforeEach(() => { vi.clearAllMocks(); mocks.context.mockResolvedValue({ supabase: {}, activity: { id: "activity", team_id: "team", organization_id: "club" } }); mocks.add.mockResolvedValue({ data: 2, error: null }); });
describe("activity participant routes", () => {
  it("denies searching before accessing people when permission is missing", async () => {
    mocks.context.mockResolvedValue({ error: NextResponse.json({ error: "denied" }, { status: 403 }) });
    expect((await GET(new Request("https://example.test?q=Anna"), params)).status).toBe(403);
  });
  it("rejects an empty search rather than listing the club", async () => {
    expect((await GET(new Request("https://example.test?q="), params)).status).toBe(400);
  });
  it("rejects missing participation roles without writing", async () => {
    expect((await POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ participants: [{ personId }] }) }), params)).status).toBe(400);
    expect(mocks.add).not.toHaveBeenCalled();
  });
  it("delegates a reviewed registration to the atomic application command", async () => {
    const input = { participants: [{ personId, role: "participant" }], registerAccepted: true };
    expect((await POST(new Request("https://example.test", { method: "POST", body: JSON.stringify(input) }), params)).status).toBe(200);
    expect(mocks.add).toHaveBeenCalledWith({}, "activity", input);
  });
});
