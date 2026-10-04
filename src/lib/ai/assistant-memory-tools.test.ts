import { describe, expect, it, vi } from "vitest";
import { createAssistantMemoryTools } from "./assistant-memory-tools";
import { normalizeMemoryDraft, type AssistantMemoryDraft } from "./assistant-memory-draft";

const scope = {
  organizationId: "10000000-0000-0000-0000-000000000001", sectionId: "20000000-0000-0000-0000-000000000001",
  teamId: "30000000-0000-0000-0000-000000000001", userId: "40000000-0000-0000-0000-000000000001",
  disciplineId: "50000000-0000-0000-0000-000000000001", teamName: "F2016",
};
const input = { scope: "team" as const, kind: "convention" as const, subject: "Match", content: "Samling 45 minuter innan.", key: "match.gathering" };
function setup() {
  const drafts: AssistantMemoryDraft[] = [];
  const onDraft = vi.fn((draft: AssistantMemoryDraft) => drafts.push(draft));
  const tools = createAssistantMemoryTools(scope, onDraft);
  return { tools, onDraft, drafts };
}

describe("assistant memory proposals", () => {
  it("only proposes even when a tool call requests persistent shared memory", async () => {
    const { tools, drafts } = setup();
    const result = await tools.remember.execute!(input, {} as never);
    expect(result).toMatchObject({ proposed: true, saved: false, requiresConfirmation: true });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ scope: "team", scopeId: scope.teamId, organizationId: scope.organizationId, scopeName: "F2016", userId: scope.userId });
    expect(normalizeMemoryDraft(drafts[0])).toEqual(drafts[0]);
    // There is deliberately no database dependency and no confirmation tool.
    expect(Object.keys(tools)).toEqual(["remember"]);
  });
  it.each(["personal", "team", "section", "organization"] as const)("requires confirmation for %s", async level => {
    const { tools } = setup();
    expect(await tools.remember.execute!({ ...input, scope: level }, {} as never)).toMatchObject({ saved: false, requiresConfirmation: true });
  });
  it("rejects invalid and system-scoped proposals at the execution boundary", async () => {
    const { tools, onDraft } = setup();
    expect(await tools.remember.execute!({ ...input, scope: "system" } as never, {} as never)).toMatchObject({ proposed: false, saved: false });
    expect(await tools.remember.execute!({ ...input, content: " " }, {} as never)).toMatchObject({ proposed: false });
    expect(await tools.remember.execute!({ ...input, content: 123 } as never, {} as never)).toMatchObject({ proposed: false });
    expect(onDraft).not.toHaveBeenCalled();
  });
  it("deduplicates proposals and limits the number per answer", async () => {
    const { tools, drafts } = setup();
    await tools.remember.execute!(input, {} as never);
    await tools.remember.execute!(input, {} as never);
    expect(drafts).toHaveLength(1);
    for (let i = 0; i < 5; i++) await tools.remember.execute!({ ...input, content: `Memory ${i}` }, {} as never);
    expect(drafts).toHaveLength(3);
  });
  it("does not silently turn a missing discipline into a general memory", async () => {
    const onDraft = vi.fn();
    const tools = createAssistantMemoryTools({ ...scope, disciplineId: null }, onDraft);
    expect(await tools.remember.execute!({ ...input, disciplineSpecific: true }, {} as never)).toMatchObject({ proposed: false });
    expect(onDraft).not.toHaveBeenCalled();
  });
});
