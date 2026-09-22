import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { createFallbackBriefing, generateTeamBriefing, type TeamSignal } from "./team-briefing";

const signals: TeamSignal[] = [
  { id: "activity:1", kind: "activity", title: "Match", detail: "Nästa aktivitet", dueAt: "2026-09-25T16:00:00Z", importance: "normal" },
  { id: "invitations:1", kind: "invitation", title: "Tre saknar svar", detail: "Följ upp svar", dueAt: "2026-09-23T16:00:00Z", importance: "high" },
];

describe("team briefing", () => {
  it("uses deterministic urgency when AI is unavailable", () => {
    const result = createFallbackBriefing(signals, new Date("2026-09-22T16:00:00Z"));
    expect(result.items[0].signalId).toBe("invitations:1");
  });

  it("accepts a structured response from a mocked model", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: "text", text: JSON.stringify({ headline: "Följ upp svaren", summary: "Tre svar saknas inför matchen.", items: [{ signalId: "invitations:1", reason: "Svar behövs före matchen." }] }) }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: 42, noCache: 42, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 18, text: 18, reasoning: undefined },
        },
        warnings: [],
      }),
    });

    const result = await generateTeamBriefing({ signals, model });
    expect(result.briefing.items[0].signalId).toBe("invitations:1");
    expect(result.usage.inputTokens).toBe(42);
  });
});
