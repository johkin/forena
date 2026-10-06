import { beforeEach, expect, it, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import type { AssistantDependencies } from "./team-assistant-types";

const state = vi.hoisted(() => ({ model: undefined as unknown, context: vi.fn() }));
vi.mock("./team-assistant-context", () => ({ loadTeamAssistantContext: state.context }));
vi.mock("ai", async importOriginal => {
  const original = await importOriginal<typeof import("ai")>();
  return { ...original, ToolLoopAgent: class {
    constructor(options: ConstructorParameters<typeof original.ToolLoopAgent>[0]) {
      return new original.ToolLoopAgent({ ...options, model: state.model as typeof options.model });
    }
  } };
});
import { answerTeamAssistant } from "./team-assistant";

const teamId = "00000000-0000-4000-8000-000000000001";
const otherTeamId = "00000000-0000-4000-8000-000000000002";
const history = { team: "F2016", from: "2026-09-16", through: "2026-10-06", category: "session", timeZone: "Europe/Stockholm",
  activityCount: 6, unreportedActivityCount: 1, truncated: false, summary: { uniquePeople: 12, participationCount: 48 }, activities: [], records: [] };
const input = { teamId, question: "Hur många har registrerad träning de senaste tre veckorna?", messages: [] };
const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 } };
function toolCall(toolName: string, args: object) {
  return { content: [{ type: "tool-call" as const, toolCallId: toolName, toolName, input: JSON.stringify(args) }],
    finishReason: { unified: "tool-calls" as const, raw: undefined }, usage, warnings: [] };
}
function textResult(text: string) {
  return { content: [{ type: "text" as const, text }], finishReason: { unified: "stop" as const, raw: undefined }, usage, warnings: [] };
}
function setup(readArgs: { category: string; relativeDays: number; teamId?: string } = { category: "session", relativeDays: 21 }, text = "12 personer har registrerad träning.", allowed = true) {
  const model = new MockLanguageModelV3({ doGenerate: [toolCall("listHistoryTeams", {}), toolCall("readActivityHistory", readArgs), textResult(text)] });
  state.model = model;
  const rpc = vi.fn(async (name: string) => ({ data: name === "activity_history_teams"
    ? [{ id: teamId, name: "F2016", canReadAttendance: allowed, canReadWork: false }, { id: otherTeamId, name: "F2013", canReadAttendance: true, canReadWork: false }]
    : history, error: null }));
  return { model, rpc, dependencies: { supabase: { rpc } as unknown as AssistantDependencies["supabase"], userId: "user" } };
}
beforeEach(() => {
  state.context.mockResolvedValue({ organization: null, activities: [], activityIds: [], canManageActivities: false, canManageInvitations: false,
    memoryScope: { organizationId: "org", sectionId: "section", teamId, userId: "user", disciplineId: null }, organizationToday: "2026-10-06",
    context: { team: "F2016", teamId, viewer: { kind: "leader" }, memories: [] } });
});

it("executes native calls through the real SDK and defaults to the current team's ID", async () => {
  const { model, rpc, dependencies } = setup();
  const reply = await answerTeamAssistant(input, dependencies);
  expect(reply.historyResults).toEqual([expect.objectContaining({ summary: history.summary })]);
  expect(reply.answer).toBe("12 personer har registrerad träning.");
  expect(rpc).toHaveBeenLastCalledWith("read_activity_history", { target_team_id: teamId, category: "session", from_date: history.from, through_date: history.through, guests_only: false });
  expect(model.doGenerateCalls[0].toolChoice).toEqual({ type: "tool", toolName: "listHistoryTeams" });
  expect(model.doGenerateCalls[1].toolChoice).toEqual({ type: "tool", toolName: "readActivityHistory" });
  expect(model.doGenerateCalls[2].tools?.map(tool => "name" in tool && tool.name)).not.toContain("remember");
});

it("allows an explicitly selected authorized team instead of substituting the current team", async () => {
  const { rpc, dependencies } = setup({ category: "session", relativeDays: 21, teamId: otherTeamId });
  await answerTeamAssistant({ ...input, question: "Vilka tränade med F2013 de senaste tre veckorna?" }, dependencies);
  expect(rpc).toHaveBeenLastCalledWith("read_activity_history", expect.objectContaining({ target_team_id: otherTeamId }));
});

it("does not turn denied attendance access into fabricated totals", async () => {
  const { rpc, dependencies } = setup(undefined, "12 personer", false);
  const reply = await answerTeamAssistant(input, dependencies);
  expect(reply).toMatchObject({ source: "fallback", historyResults: [] });
  expect(reply.answer).toContain("saknar behörighet");
  expect(rpc.mock.calls.map(([name]) => name)).not.toContain("read_activity_history");
});

it("replaces Python-like tool text with verified totals after a successful read", async () => {
  const { dependencies } = setup(undefined, "tool_code\nprint(default_api.readActivityHistory(category='session', relativeDays=21))");
  const reply = await answerTeamAssistant(input, dependencies);
  expect(reply.answer).toContain("12 unika personer");
  expect(reply.answer).toContain("48 registrerade deltagartillfällen");
  expect(reply.answer).not.toContain("tool_code");
});

it("does not expose tool text or claim success when a provider ignores the forced call", async () => {
  const { dependencies } = setup();
  state.model = new MockLanguageModelV3({ doGenerate: textResult("tool_code\nprint(default_api.readActivityHistory(category='session', relativeDays=21))") });
  const reply = await answerTeamAssistant(input, dependencies);
  expect(reply.source).toBe("fallback");
  expect(reply.historyResults ?? []).toEqual([]);
  expect(reply.answer).toContain("Historiken kunde inte hämtas");
  expect(reply.answer).not.toContain("default_api");
});

it("asks for a missing period without forcing the model to invent dates", async () => {
  const { model, rpc, dependencies } = setup();
  model.doGenerate = vi.fn()
    .mockResolvedValueOnce(toolCall("listHistoryTeams", {}))
    .mockResolvedValueOnce(textResult("Vilken period vill du se registrerad träning för?"));
  const reply = await answerTeamAssistant({ ...input, question: "Hur många har registrerad träning?" }, dependencies);
  expect(reply.answer).toContain("Vilken period");
  expect(rpc.mock.calls.map(([name]) => name)).not.toContain("read_activity_history");
});
