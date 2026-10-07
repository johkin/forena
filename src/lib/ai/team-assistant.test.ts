import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantDependencies } from "./team-assistant-types";
import * as reminderTools from "./reminder-tools";

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
  activityTypeId: "00000000-0000-0000-0000-000000000002",
  title: "Träning", description: "Välkomna!", location: "Planen", startsOn: "2026-10-20", startTime: "18:00",
  durationMinutes: 90, gatheringMinutesBefore: 15, recurrence: { weekdays: [2, 4], endsOn: "2026-10-29" },
};

describe("answerTeamAssistant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.context.mockResolvedValue({
      organization: { assistant_name: "Nova" }, activities: [], activityIds: [],
      canManageActivities: true, memoryScope: { organizationId: "org", sectionId: "section", teamId: "team", userId: "user", disciplineId: null }, organizationToday: "2026-10-01", context: { viewer: { kind: "leader" }, memories: [], activityTypes: [{ id: draft.activityTypeId, name: "Träning", category: "session" }] },
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

  it("routes the reported request to a Friday draft instead of history", async () => {
    const fridayDraft = { ...draft, title: "Spela mera F2014-2016", startsOn: "2026-10-07", startTime: "16:15", durationMinutes: 60, recurrence: { weekdays: [5], endsOn: "2026-11-30" } };
    mocks.generate.mockResolvedValue({ output: fridayDraft, usage: {} });
    const reply = await answerTeamAssistant({ ...input, question: 'kan du lägga till träning "Spela mera F2014-2016" på fredagar kl 16:15-17:15 med slut sista november' }, dependencies);
    expect(reply.activityDraft).toEqual({ ...fridayDraft, sources: [] });
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(mocks.chat).not.toHaveBeenCalled();
    expect(mocks.agentOptions).not.toHaveBeenCalled();
  });

  it("reports a draft failure rather than a history failure for the reported request", async () => {
    mocks.generate.mockRejectedValue(new Error("provider unavailable"));
    await expect(answerTeamAssistant({ ...input, question: 'kan du lägga till träning "Spela mera F2014-2016" på fredagar kl 16:15-17:15 med slut sista november' }, dependencies)).rejects.toMatchObject({ code: "draft-unavailable" });
    expect(mocks.chat).not.toHaveBeenCalled();
  });

  it("routes the Friday request directly to a typed training series and skips elapsed dates", async () => {
    mocks.generate.mockResolvedValue({ output: { ...draft, location: "Ursvik IP", startsOn: "2026-09-07", startTime: "16:15", durationMinutes: 60, recurrence: { weekdays: [5], endsOn: "2026-11-30" } }, usage: {} });
    const reply = await answerTeamAssistant({ ...input, question: "Jag vill ha träningar varje fredag på Ursvik IP kl 16:15-17:15. Start 7 september och november ut" }, dependencies);
    expect(mocks.chat).not.toHaveBeenCalled();
    expect(reply.activityDraft).toMatchObject({ activityTypeId: draft.activityTypeId, location: "Ursvik IP", startsOn: "2026-10-01", startTime: "16:15", durationMinutes: 60, recurrence: { weekdays: [5], endsOn: "2026-11-30" } });
    expect(reply.answer).toContain("Passerade datum hoppas över");
  });

  it.each([null, { weekdays: [5], endsOn: "2026-09-30" }])("rejects a past single activity or entirely past series", async recurrence => {
    mocks.generate.mockResolvedValue({ output: { ...draft, startsOn: "2026-09-07", recurrence }, usage: {} });
    await expect(answerTeamAssistant(input, dependencies)).rejects.toMatchObject({ code: "draft-unavailable" });
  });

  it("rejects invalid draft output instead of returning a single activity fallback", async () => {
    mocks.generate.mockResolvedValue({ output: { ...draft, recurrence: { weekdays: [8], endsOn: null } }, usage: {} });
    await expect(answerTeamAssistant(input, dependencies)).rejects.toMatchObject({ code: "draft-unavailable" });
  });

  it("rejects a single draft when Fridays were explicitly requested", async () => {
    mocks.generate.mockResolvedValue({ output: { ...draft, recurrence: null }, usage: {} });
    await expect(answerTeamAssistant({ ...input, question: "Jag vill ha träningar varje fredag" }, dependencies)).rejects.toMatchObject({ code: "draft-unavailable" });
  });

  it.each(["leader", "player-or-guardian"] as const)("selects the %s tone using server context", async kind => {
    mocks.context.mockResolvedValue({
      organization: null, activities: [], activityIds: [], canManageActivities: false,
      memoryScope: { organizationId: "org", sectionId: "section", teamId: "team", userId: "user", disciplineId: null },
      organizationToday: "2026-10-01", context: { viewer: { kind }, memories: [] },
    });
    const result = await answerTeamAssistant(input, dependencies);
    expect(result.activityDraft).toBeUndefined();
    expect(mocks.generate).not.toHaveBeenCalled();
    const prompt = mocks.agentOptions.mock.calls[0][0].instructions;
    expect(prompt.includes("professionellt, sakligt och tydligt")).toBe(kind === "leader");
    expect(prompt.includes("så att ett barn förstår")).toBe(kind !== "leader");
    expect(Boolean(mocks.agentOptions.mock.calls[0][0].tools.readActivityHistory)).toBe(kind === "leader");
    expect(mocks.agentOptions.mock.calls[0][0].tools).not.toHaveProperty("proposeReminder");
  });

  it("propagates team access rejection before calling AI", async () => {
    mocks.context.mockRejectedValue(new Error("forbidden"));
    await expect(answerTeamAssistant(input, dependencies)).rejects.toThrow("forbidden");
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.chat).not.toHaveBeenCalled();
  });

  it("returns authorized history cards separately from generated text", async () => {
    const history = { team: "Lag A", from: "2026-09-11", through: "2026-10-01", category: "session", timeZone: "Europe/Stockholm", activityCount: 6, unreportedActivityCount: 1, truncated: true, summary: { uniquePeople: 30, participationCount: 210 }, activities: [], records: [] };
    const rpc = vi.fn(async (name: string) => ({ data: name === "activity_history_teams" ? [{ id: "team", canReadAttendance: true, canReadWork: false }] : history, error: null }));
    mocks.chat.mockImplementationOnce(async ({ prompt }) => {
      expect(JSON.parse(prompt).context.historyPeriod).toEqual({ from: "2026-09-11", through: "2026-10-01" });
      await mocks.agentOptions.mock.calls[0][0].tools.readActivityHistory.execute({ category: "session", guestsOnly: false }, {});
      return { text: "30 personer", usage: {} };
    });
    const result = await answerTeamAssistant({ ...input, question: "Hur många har tränat de senaste tre veckorna?" }, { ...dependencies, supabase: { rpc } as unknown as AssistantDependencies["supabase"] });
    expect(result.answer).toContain("30 unika personer med registrerad närvaro");
    expect(result.historyResults).toEqual([expect.objectContaining({ summary: { uniquePeople: 30, participationCount: 210 } })]);
    expect(rpc).toHaveBeenLastCalledWith("read_activity_history", expect.objectContaining({ from_date: "2026-09-11", through_date: "2026-10-01" }));
  });

  it("offers reminder tools only for invitation managers and excludes personal memories", async () => {
    const toolFactory = vi.spyOn(reminderTools, "createReminderTools");
    mocks.context.mockResolvedValue({ organization: null, activities: [], activityIds: ["activity"], canManageActivities: false, canManageInvitations: true,
      memoryScope: { organizationId: "org", sectionId: "section", teamId: "team", userId: "user", disciplineId: null },
      organizationToday: "2026-10-01", context: { viewer: { kind: "leader" }, clock: { organizationTimeZone: "Europe/Stockholm" }, memories: [
        { scope: "personal", content: "Privat preferens", subject: "Privat", disciplineId: null },
        { scope: "team", content: "Nio spelare", subject: "Match", disciplineId: null },
      ] } });
    await answerTeamAssistant({ ...input, question: "Behöver vi påminna?" }, dependencies);
    expect(mocks.agentOptions.mock.calls[0][0].tools).toHaveProperty("assessReminder");
    expect(mocks.agentOptions.mock.calls[0][0].tools).toHaveProperty("proposeReminder");
    expect(toolFactory).toHaveBeenCalledWith(expect.objectContaining({ memories: [{ scope: "team", content: "Nio spelare", subject: "Match", disciplineId: null }] }));
    expect(mocks.agentOptions.mock.calls[0][0].instructions).toContain("Personliga minnen får inte styra utskick till laget");
    toolFactory.mockRestore();
  });
});
