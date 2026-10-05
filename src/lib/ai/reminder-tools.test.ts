import { beforeEach, expect, it, vi } from "vitest";
import type { AssistantDependencies } from "./team-assistant-types";
import type { ReminderDraft } from "./reminder-draft";
const mocks = vi.hoisted(() => ({ assess: vi.fn() }));
vi.mock("../activity-reminders", () => ({ assessActivityReminder: mocks.assess }));
import { createReminderTools } from "./reminder-tools";

const assessment = { teamId: "team", activityId: "activity", title: "Match", canRemind: true, pending: 4, fingerprint: "hash" };
beforeEach(() => { vi.clearAllMocks(); mocks.assess.mockResolvedValue(assessment); });
function setup() {
  const drafts: ReminderDraft[] = [];
  const write = vi.fn(() => { throw new Error("AI must not write"); });
  const tools = createReminderTools({ supabase: { from: write, rpc: write } as unknown as AssistantDependencies["supabase"], teamId: "team", activityIds: ["activity"],
    memories: [{ scope: "team", subject: "Match", content: "Minst nio spelare önskas", disciplineId: "football" }], onDraft: draft => drafts.push(draft) });
  const executeOptions = { toolCallId: "test", messages: [], context: {} };
  return { drafts, write,
    assess: (activityId = "activity") => tools.assessReminder.execute!({ activityId }, executeOptions),
    propose: (memoryIndexes = [0]) => tools.proposeReminder.execute!({ activityId: "activity", reason: "För få spelare inför matchen", memoryIndexes }, executeOptions),
  };
}
it("reads an assessment and returns a draft with actual memory sources, never writing", async () => {
  const { assess, propose, drafts, write } = setup();
  await assess();
  expect(await propose()).toMatchObject({ proposed: true, requiresButtonConfirmation: true });
  expect(drafts[0].memories[0].content).toBe("Minst nio spelare önskas");
  expect(drafts[0].assessment).toEqual(assessment);
  expect(write).not.toHaveBeenCalled();
});
it("rejects ids outside current context before querying", async () => {
  const { assess } = setup();
  expect(await assess("other-team-activity")).toHaveProperty("error");
  expect(mocks.assess).not.toHaveBeenCalled();
});
it("requires an assessment before proposing", async () => {
  const { propose, drafts } = setup();
  expect(await propose()).toHaveProperty("error");
  expect(drafts).toEqual([]);
});
it("rejects invented memory references", async () => {
  const { assess, propose, drafts } = setup();
  await assess();
  expect(await propose([99])).toHaveProperty("error");
  expect(drafts).toEqual([]);
});
it("allows a suggestion without memories", async () => {
  const { assess, propose, drafts } = setup();
  await assess(); await propose([]);
  expect(drafts[0].memories).toEqual([]);
});
it("does not propose when the deterministic assessment blocks a reminder", async () => {
  mocks.assess.mockResolvedValue({ ...assessment, canRemind: false, blockedReason: "Redan påmint" });
  const { assess, propose, drafts } = setup();
  await assess(); expect(await propose()).toEqual({ error: "Redan påmint" });
  expect(drafts).toEqual([]);
});
