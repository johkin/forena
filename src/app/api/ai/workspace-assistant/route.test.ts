import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ answer: vi.fn(), dashboard: vi.fn(), authentication: { userId: "user", supabase: {} } }));
vi.mock("@/lib/http/authenticated-route", () => ({ withAuthenticatedRoute: (handler: (request: Request, authentication: unknown) => Promise<Response>) => (request: Request) => handler(request, state.authentication) }));
vi.mock("@/lib/ai/workspace-assistant", () => ({ answerWorkspaceAssistant: state.answer }));
vi.mock("@/data/team-dashboard", () => ({ getTeamDashboard: state.dashboard }));
import { POST } from "./route";
import { TeamAssistantError } from "@/lib/ai/team-assistant-types";
const body = { organizationId: "00000000-0000-4000-8000-000000000001", question: "Nästa aktivitet?", messages: [] };
const request = (value: unknown) => new Request("http://localhost/api/ai/workspace-assistant", { method: "POST", body: JSON.stringify(value) });
beforeEach(() => { vi.clearAllMocks(); state.answer.mockResolvedValue({ answer: "Svar", source: "ai", model: "test" }); });
it("rejects malformed scope and oversized history before invoking a model", async () => {
  expect((await POST(request({ ...body, organizationId: "invalid" }))).status).toBe(400);
  expect((await POST(request({ ...body, messages: Array.from({ length: 7 }, () => ({ role: "user", content: "Hej" })) }))).status).toBe(400);
  expect(state.answer).not.toHaveBeenCalled();
});
it("passes bounded page context without fetching editor data for ordinary answers", async () => {
  const page = { path: "/o/uik/memories", title: "Assistentminnen" };
  const response = await POST(request({ ...body, page }));
  expect(response.status).toBe(200);
  expect(state.answer).toHaveBeenCalledWith(expect.objectContaining({ page }), state.authentication);
  expect(state.dashboard).not.toHaveBeenCalled();
});
it("reports permission errors without revealing team data", async () => {
  state.answer.mockRejectedValueOnce(new TeamAssistantError("team-forbidden", "Du saknar åtkomst"));
  expect((await POST(request(body))).status).toBe(403);
  expect(state.dashboard).not.toHaveBeenCalled();
});

function mockDraftEditor(permissions: string[]) {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data: { slug: "f2016", organization_id: body.organizationId }, error: null })) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  Object.assign(state.authentication.supabase, { from: vi.fn(() => query) });
  state.answer.mockResolvedValue({ answer: "Granska träningen", activityDraft: { title: "Träning" }, targetTeamId: "00000000-0000-4000-8000-000000000002" });
  state.dashboard.mockResolvedValue({ organization: { id: body.organizationId }, team: { name: "F2016" }, rosterMembers: [{ id: "member" }], teamPermissions: permissions });
}
it("returns server-fetched editor context only to authorized activity managers", async () => {
  mockDraftEditor(["activity.manage", "invitation.manage"]);
  const response = await POST(request(body));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ activityDraft: { title: "Träning" }, draftContext: { team: { name: "F2016" }, members: [{ id: "member" }], canManageInvitations: true } });
});
it("rejects drafts if renewed editor authorization is missing", async () => {
  mockDraftEditor(["team.view"]);
  const response = await POST(request(body));
  expect(response.status).toBe(403);
  expect(await response.json()).not.toHaveProperty("draftContext");
});
