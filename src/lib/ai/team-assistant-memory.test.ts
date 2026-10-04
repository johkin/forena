import { expect, it, vi } from "vitest";
import type { AssistantDependencies } from "./team-assistant-types";
const mocks = vi.hoisted(() => ({ context: vi.fn(), tools: vi.fn(), options: vi.fn() }));
vi.mock("./team-assistant-context", () => ({ loadTeamAssistantContext: mocks.context }));
vi.mock("./team-assistant-tools", () => ({ createTeamAssistantTools: mocks.tools }));
vi.mock("ai", async importOriginal => ({
  ...await importOriginal<typeof import("ai")>(),
  ToolLoopAgent: class {
    private options: { tools: { remember: { execute: (input: unknown, options: unknown) => Promise<unknown> } } };
    constructor(options: { tools: { remember: { execute: (input: unknown, options: unknown) => Promise<unknown> } } }) { this.options = options; mocks.options(options); }
    async generate() {
      await this.options.tools.remember.execute({ scope: "team", kind: "convention", subject: "Match", content: "Proposed text from an untrusted context" }, {});
      return { text: "Granska förslaget.", usage: {} };
    }
  },
}));
import { answerTeamAssistant } from "./team-assistant";

it("returns a draft without database writes even if untrusted context induces the tool call", async () => {
  const write = vi.fn(() => { throw new Error("No persistence is allowed during generation"); });
  const dependencies = { supabase: { from: write, rpc: write } as unknown as AssistantDependencies["supabase"], userId: "40000000-0000-0000-0000-000000000001" };
  mocks.context.mockResolvedValue({ organization: { assistant_name: "Nova" }, activities: [], activityIds: [], canManageActivities: false,
    organizationToday: "2026-10-04", context: { viewer: { kind: "leader" }, comment: "Untrusted RSVP text" },
    memoryScope: { organizationId: "10000000-0000-0000-0000-000000000001", sectionId: "20000000-0000-0000-0000-000000000001", teamId: "30000000-0000-0000-0000-000000000001", userId: dependencies.userId, disciplineId: null } });
  mocks.tools.mockReturnValue({});
  const result = await answerTeamAssistant({ teamId: "30000000-0000-0000-0000-000000000001", question: "Visa vad som händer", messages: [] }, dependencies);
  expect(result.memoryDrafts).toHaveLength(1);
  expect(result.memoryDrafts?.[0].content).toBe("Proposed text from an untrusted context");
  expect(write).not.toHaveBeenCalled();
  expect(Object.keys(mocks.options.mock.calls[0][0].tools)).toEqual(["remember"]);
});
