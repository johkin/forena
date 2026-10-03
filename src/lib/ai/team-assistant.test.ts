import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantDependencies } from "./team-assistant-types";

const mocks = vi.hoisted(() => ({ context: vi.fn(), generate: vi.fn(), chat: vi.fn(), agentOptions: vi.fn() }));
vi.mock("./team-assistant-context", () => ({ loadTeamAssistantContext: mocks.context }));
vi.mock("ai", async importOriginal => ({
  ...await importOriginal<typeof import("ai")>(),
  generateText: mocks.generate,
  ToolLoopAgent: class {
    constructor(options: unknown) { mocks.agentOptions(options); }
    generate = mocks.chat;
  },
}));
import { answerTeamAssistant } from "./team-assistant";

const dependencies: AssistantDependencies = { supabase: {} as AssistantDependencies["supabase"], userId: "user" };
const input = { teamId: "team", question: "Skapa träningar varje tisdag och torsdag", messages: [] };
const draft = {
  title: "Träning", description: "Välkomna!", location: "Planen", startsOn: "2026-10-20", startTime: "18:00",
  durationMinutes: 90, gatheringMinutesBefore: 15, recurrence: { weekdays: [2, 4], endsOn: "2026-10-29" },
};

describe("answerTeamAssistant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.context.mockResolvedValue({
      organization: { assistant_name: "Nova" }, activities: [], activityIds: [],
      canManageActivities: true, memoryScope: { organizationId: "org", sectionId: "section", teamId: "team", userId: "user" }, organizationToday: "2026-10-01", context: { viewer: { kind: "leader" }, memories: [] },
    });
    mocks.generate.mockResolvedValue({ output: draft, usage: { inputTokens: 10, outputTokens: 10 } });
    mocks.chat.mockResolvedValue({ text: "Svar", usage: {} });
  });

  it("returns a recurring draft ready for the editor without saving anything", async () => {
    const result = await answerTeamAssistant(input, dependencies);
    expect(result.activityDraft).toEqual({ ...draft, sources: [] });
    expect(result.answer).toContain("aktivitetsserie");
    expect(mocks.chat).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledOnce();
  });

  it("asks the leader to complete a missing end date in the series editor", async () => {
    mocks.generate.mockResolvedValue({ output: { ...draft, recurrence: { weekdays: [2], endsOn: null } }, usage: {} });
    expect((await answerTeamAssistant(input, dependencies)).answer).toContain("Fyll i slutdatum");
  });

  it("rejects invalid draft output instead of returning a single activity fallback", async () => {
    mocks.generate.mockResolvedValue({ output: { ...draft, recurrence: { weekdays: [8], endsOn: null } }, usage: {} });
    await expect(answerTeamAssistant(input, dependencies)).rejects.toMatchObject({ code: "draft-unavailable" });
  });

  it.each(["leader", "player-or-guardian"] as const)("selects the %s tone using server context", async kind => {
    mocks.context.mockResolvedValue({
      organization: null, activities: [], activityIds: [], canManageActivities: false,
      memoryScope: { organizationId: "org", sectionId: "section", teamId: "team", userId: "user" },
      organizationToday: "2026-10-01", context: { viewer: { kind }, memories: [] },
    });
    const result = await answerTeamAssistant(input, dependencies);
    expect(result.activityDraft).toBeUndefined();
    expect(mocks.generate).not.toHaveBeenCalled();
    const prompt = mocks.agentOptions.mock.calls[0][0].instructions;
    expect(prompt.includes("professionellt, sakligt och tydligt")).toBe(kind === "leader");
    expect(prompt.includes("så att ett barn förstår")).toBe(kind !== "leader");
  });

  it("propagates team access rejection before calling AI", async () => {
    mocks.context.mockRejectedValue(new Error("forbidden"));
    await expect(answerTeamAssistant(input, dependencies)).rejects.toThrow("forbidden");
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.chat).not.toHaveBeenCalled();
  });
});
