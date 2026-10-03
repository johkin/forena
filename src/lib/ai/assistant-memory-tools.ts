import { jsonSchema, tool } from "ai";
import type { AssistantDependencies } from "./team-assistant-types";

type MemoryScope = "personal" | "team" | "section" | "organization";
type MemoryKind = "fact" | "preference" | "instruction" | "convention";

export type AssistantMemoryScope = {
  organizationId: string;
  sectionId: string;
  teamId: string;
  userId: string;
};

export function createAssistantMemoryTools(
  supabase: AssistantDependencies["supabase"],
  scope: AssistantMemoryScope,
) {
  const scopeIds: Record<MemoryScope, string> = {
    personal: scope.userId,
    team: scope.teamId,
    section: scope.sectionId,
    organization: scope.organizationId,
  };

  return {
    remember: tool({
      description: "Spara beständig information som användaren uttryckligen ber assistenten komma ihåg, eller en tydlig stabil konvention som är värdefull i framtida samtal. Spara inte känsliga personuppgifter, hälsouppgifter, tillfälliga planer eller fakta som redan finns strukturerade i Förena. Välj minsta lämpliga scope.",
      inputSchema: jsonSchema<{
        scope: MemoryScope;
        kind: MemoryKind;
        subject: string;
        key?: string;
        content: string;
      }>({
        type: "object",
        properties: {
          scope: { type: "string", enum: ["personal", "team", "section", "organization"] },
          kind: { type: "string", enum: ["fact", "preference", "instruction", "convention"] },
          subject: { type: "string", minLength: 1, maxLength: 80 },
          key: { type: "string", pattern: "^[a-z0-9]+(?:[._-][a-z0-9]+)*$" },
          content: { type: "string", minLength: 1, maxLength: 1200 },
        },
        required: ["scope", "kind", "subject", "content"],
        additionalProperties: false,
      }),
      execute: async input => {
        const row = {
          organization_id: scope.organizationId,
          scope: input.scope,
          scope_id: scopeIds[input.scope],
          kind: input.kind,
          subject: input.subject.trim(),
          memory_key: input.key ?? null,
          content: input.content.trim(),
          created_by: scope.userId,
        };
        const query = input.key
          ? supabase.from("assistant_memories").upsert(row, { onConflict: "scope,scope_id,memory_key" })
          : supabase.from("assistant_memories").insert(row);
        const { error } = await query;
        if (error) return { saved: false, error: error.code === "42501" ? "Du saknar behörighet att spara minne på den nivån." : "Minnet kunde inte sparas." };
        return { saved: true, scope: input.scope, kind: input.kind, content: row.content };
      },
    }),
  };
}
