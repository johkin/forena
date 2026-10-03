import { describe, expect, it, vi } from "vitest";
import { createAssistantMemoryTools } from "./assistant-memory-tools";
import type { AssistantDependencies } from "./team-assistant-types";

function setup(error: { code?: string } | null = null) {
  const insert = vi.fn().mockResolvedValue({ error });
  const upsert = vi.fn().mockResolvedValue({ error });
  const from = vi.fn(() => ({ insert, upsert }));
  const supabase = { from } as unknown as AssistantDependencies["supabase"];
  return { tools: createAssistantMemoryTools(supabase, { organizationId: "org", sectionId: "section", teamId: "team", userId: "user" }), insert, upsert };
}

describe("assistant memory tools", () => {
  it("stores a keyed team memory using the current team scope", async () => {
    const { tools, upsert } = setup();
    const result = await tools.remember.execute!({ scope: "team", kind: "convention", subject: "match", key: "match.gathering", content: "Samling 45 minuter före hemmamatch." }, {} as never);
    expect(result).toMatchObject({ saved: true, scope: "team" });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ organization_id: "org", scope_id: "team", created_by: "user" }), { onConflict: "scope,scope_id,memory_key" });
  });

  it("reports RLS permission failures without claiming that memory was saved", async () => {
    const { tools } = setup({ code: "42501" });
    const result = await tools.remember.execute!({ scope: "organization", kind: "fact", subject: "club", content: "Klubbregel" }, {} as never);
    expect(result).toMatchObject({ saved: false });
  });
});
