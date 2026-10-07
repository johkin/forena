import { beforeEach, expect, it, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";

const state = vi.hoisted(() => ({ model: undefined as unknown }));
vi.mock("ai", async importOriginal => {
  const original = await importOriginal<typeof import("ai")>();
  return { ...original, generateText: (options: Parameters<typeof original.generateText>[0]) => original.generateText({ ...options, model: state.model as typeof options.model }) };
});
import { classifyTeamAssistantIntent } from "./team-assistant-intent";

const options = { model: "test/model", userId: "user", today: "2026-10-07" };
const base = { mode: "chat", question: "Hej", weeklyRecurrence: false, webResearch: false, periodRequested: false, category: null, response: "all", memberRole: null, clarification: null };
function modelOutput(output: unknown) {
  const model = new MockLanguageModelV3({ doGenerate: {
    content: [{ type: "text", text: JSON.stringify(output) }], finishReason: { unified: "stop", raw: undefined },
    usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 } }, warnings: [],
  } });
  state.model = model;
  return model;
}
beforeEach(() => { state.model = undefined; });

it.each([
  ["activity-draft", 'kan du lägga till träning "Spela mera F2014-2016" på fredagar kl 16:15-17:15 med slut sista november'],
  ["activity-history", "Vilka var faktiskt närvarande under oktober?"],
  ["activity-history", "Kan du göra en sammanställning av träningar de senaste tre veckorna?"],
  ["activity-invitations", "Vilka har tackat ja till fredagens träning?"],
  ["reminder", "Kan du lägga till en påminnelse för träningen?"],
  ["chat", "Kom ihåg att vi brukar samlas femton minuter före"],
])("consumes a validated %s decision through the real SDK", async (mode, question) => {
  const expected = { ...base, mode, question, weeklyRecurrence: mode === "activity-draft" };
  const model = modelOutput(expected);
  const result = await classifyTeamAssistantIntent({ teamId: "team", question, messages: [] }, options);
  expect(result).toEqual(expected);
  expect(model.doGenerateCalls[0].responseFormat?.type).toBe("json");
  expect(model.doGenerateCalls[0].tools).toBeUndefined();
});

it("passes conversation and the current message as data for resolving follow-ups", async () => {
  const expected = { ...base, mode: "activity-draft", question: "Skapa träningar på fredagar till sista november", weeklyRecurrence: true };
  const model = modelOutput(expected);
  const input = { teamId: "team", question: "Till sista november", messages: [{ role: "user" as const, content: "Vi vill träna på fredagar" }] };
  expect(await classifyTeamAssistantIntent(input, options)).toEqual(expected);
  const prompt = model.doGenerateCalls[0].prompt;
  expect(prompt[0].role).toBe("system");
  expect(prompt[0].content).toContain("Aktuell fråga gäller före äldre önskemål");
  expect(JSON.parse((prompt[1].content as { text: string }[])[0].text)).toEqual({ today: options.today, previousMessages: input.messages, question: input.question });
});

it.each([{ ...base, mode: "delete-everything" }, { ...base, question: "" }, { ...base, mode: "clarify", clarification: null }])("rejects invalid classification output", async output => {
  modelOutput(output);
  await expect(classifyTeamAssistantIntent({ teamId: "team", question: "Skapa träning", messages: [] }, options)).rejects.toThrow();
});

it("propagates provider failure without selecting a regex-based fallback", async () => {
  state.model = new MockLanguageModelV3({ doGenerate: async () => { throw new Error("unavailable"); } });
  await expect(classifyTeamAssistantIntent({ teamId: "team", question: "Skapa träning", messages: [] }, options)).rejects.toThrow("unavailable");
});
