import { describe, expect, it, vi } from "vitest";
import { saveConfirmedMemory } from "./assistant-memory-confirmation";
import type { AssistantMemoryDraft } from "./assistant-memory-draft";
import type { AssistantDependencies } from "./team-assistant-types";

const draft: AssistantMemoryDraft = {
  id: "60000000-0000-0000-0000-000000000001", userId: "40000000-0000-0000-0000-000000000001",
  organizationId: "10000000-0000-0000-0000-000000000001", scope: "team",
  scopeId: "30000000-0000-0000-0000-000000000001", scopeName: "F2016", disciplineId: null,
  kind: "convention", subject: "Match", key: null, content: "Samling 45 minuter innan.",
};
function setup({ allowed = true, member = true, target = true, role = "member", fail = false } = {}) {
  const insert = vi.fn();
  const eq = vi.fn();
  const rpc = vi.fn(async (name: string) => name === "upsert_assistant_memory"
    ? { data: fail ? null : draft.id, error: fail ? { code: "42501" } : null }
    : { data: allowed, error: null });
  const from = vi.fn((table: string) => {
    const result = { data: table === "organization_members" ? (member ? { role } : null)
      : table === "assistant_memories" ? (fail ? null : { id: draft.id }) : (target ? { id: draft.scopeId } : null),
      error: table === "assistant_memories" && fail ? { code: "42501" } : null };
    const query = { select: vi.fn(), eq, insert, maybeSingle: vi.fn().mockResolvedValue(result), single: vi.fn().mockResolvedValue(result) };
    query.select.mockReturnValue(query); eq.mockReturnValue(query); insert.mockReturnValue(query);
    return query;
  });
  const dependencies: AssistantDependencies = { supabase: { from, rpc } as unknown as AssistantDependencies["supabase"], userId: draft.userId };
  return { dependencies, from, rpc, insert, eq };
}

describe("explicit memory confirmation", () => {
  it("persists the exact proposal after fresh authorization", async () => {
    const { dependencies, insert, rpc } = setup();
    expect(await saveConfirmedMemory(draft, dependencies)).toEqual({ saved: true, memoryId: draft.id });
    expect(rpc).toHaveBeenCalledWith("has_team_permission", { target_team_id: draft.scopeId, target_permission: "assistant.memory.manage" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ id: draft.id, content: draft.content, scope: "team", scope_id: draft.scopeId, created_by: draft.userId }));
  });
  it("rejects revoked permission without writing", async () => {
    const { dependencies, insert } = setup({ allowed: false });
    expect(await saveConfirmedMemory(draft, dependencies)).toMatchObject({ saved: false });
    expect(insert).not.toHaveBeenCalled();
  });
  it("rejects missing membership or a target outside the organization", async () => {
    for (const options of [{ member: false }, { target: false }]) {
      const { dependencies, insert } = setup(options);
      expect(await saveConfirmedMemory(draft, dependencies)).toMatchObject({ saved: false });
      expect(insert).not.toHaveBeenCalled();
    }
  });
  it("binds confirmation to the authenticated account", async () => {
    const { dependencies, from } = setup();
    expect(await saveConfirmedMemory({ ...draft, userId: "40000000-0000-0000-0000-000000000002" }, dependencies)).toMatchObject({ saved: false });
    expect(from).not.toHaveBeenCalled();
  });
  it("does not expose system memory writes", async () => {
    const { dependencies, from } = setup({ role: "owner" });
    expect(await saveConfirmedMemory({ ...draft, scope: "system" }, dependencies)).toMatchObject({ saved: false });
    expect(from).not.toHaveBeenCalled();
  });
  it("validates content and identifiers before database access", async () => {
    const { dependencies, from } = setup();
    for (const invalid of [null, { ...draft, content: 123 }, { ...draft, content: "x".repeat(1201) }, { ...draft, scopeId: "invalid" }]) {
      expect(await saveConfirmedMemory(invalid, dependencies)).toMatchObject({ saved: false });
    }
    expect(from).not.toHaveBeenCalled();
  });
  it("uses the keyed upsert only in this explicit confirmation path", async () => {
    const { dependencies, insert, rpc } = setup();
    expect(await saveConfirmedMemory({ ...draft, key: "match.gathering" }, dependencies)).toMatchObject({ saved: true });
    expect(insert).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("upsert_assistant_memory", expect.objectContaining({ target_content: draft.content, target_memory_key: "match.gathering", target_scope_id: draft.scopeId }));
  });
  it("does not claim success when the database denies the write", async () => {
    const { dependencies } = setup({ fail: true });
    expect(await saveConfirmedMemory(draft, dependencies)).toMatchObject({ saved: false });
  });
  it("only permits the current user's personal scope", async () => {
    const { dependencies, insert } = setup();
    expect(await saveConfirmedMemory({ ...draft, scope: "personal" }, dependencies)).toMatchObject({ saved: false });
    expect(insert).not.toHaveBeenCalled();
    expect(await saveConfirmedMemory({ ...draft, scope: "personal", scopeId: draft.userId }, dependencies)).toMatchObject({ saved: true });
  });
  it("requires a club admin for organization-wide memory", async () => {
    const member = setup();
    expect(await saveConfirmedMemory({ ...draft, scope: "organization", scopeId: draft.organizationId }, member.dependencies)).toMatchObject({ saved: false });
    expect(member.insert).not.toHaveBeenCalled();
    const owner = setup({ role: "owner" });
    expect(await saveConfirmedMemory({ ...draft, scope: "organization", scopeId: draft.organizationId }, owner.dependencies)).toMatchObject({ saved: true });
  });
});
