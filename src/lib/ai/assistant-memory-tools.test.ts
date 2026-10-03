import { describe, expect, it, vi } from "vitest";
import { createAssistantMemoryTools } from "./assistant-memory-tools";
import type { AssistantDependencies } from "./team-assistant-types";

function setup(error: { code?: string } | null = null) {
  const insert = vi.fn().mockResolvedValue({ error });
  const from = vi.fn(() => ({ insert }));
  const rpc = vi.fn().mockResolvedValue({ data: "memory-id", error });
  const supabase = { from, rpc } as unknown as AssistantDependencies["supabase"];
  return { tools: createAssistantMemoryTools(supabase, { organizationId: "org", sectionId: "section", teamId: "team", userId: "user", disciplineId: "football" }), insert, rpc };
}

describe("assistant memory tools", () => {
  it("stores a keyed team memory using the current team scope", async () => {
    const { tools, rpc } = setup();
    const result = await tools.remember.execute!({ scope: "team", kind: "convention", subject: "match", key: "match.gathering", content: "Samling 45 minuter före hemmamatch." } as never, {} as never);
    expect(result).toMatchObject({ saved: true, scope: "team" });
    expect(rpc).toHaveBeenCalledWith("upsert_assistant_memory", expect.objectContaining({
      target_organization_id: "org",
      target_discipline_id: null,
      target_scope: "team",
      target_scope_id: "team",
      target_memory_key: "match.gathering",
    }));
  });


  it("allows multiple unkeyed memories through regular inserts", async () => {
    const { tools, insert } = setup();
    await tools.remember.execute!({ scope: "team", kind: "fact", subject: "one", content: "Första minnet" } as never, {} as never);
    await tools.remember.execute!({ scope: "team", kind: "fact", subject: "two", content: "Andra minnet" } as never, {} as never);
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("reports RLS permission failures without claiming that memory was saved", async () => {
    const { tools } = setup({ code: "42501" });
    const result = await tools.remember.execute!({ scope: "organization", kind: "fact", subject: "club", content: "Klubbregel" } as never, {} as never);
    expect(result).toMatchObject({ saved: false });
  });
});
