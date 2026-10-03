import { jsonSchema, tool } from "ai";
import type { AssistantDependencies } from "./team-assistant-types";

type MemoryScope = "personal" | "team" | "section" | "organization";
type MemoryKind = "fact" | "preference" | "instruction" | "convention";

export type AssistantMemoryScope = {
  organizationId: string;
  sectionId: string;
  teamId: string;
  userId: string;
  disciplineId: string | null;
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
        disciplineSpecific?: boolean;
      }>({
        type: "object",
        properties: {
          scope: { type: "string", enum: ["personal", "team", "section", "organization"] },
          kind: { type: "string", enum: ["fact", "preference", "instruction", "convention"] },
          subject: { type: "string", minLength: 1, maxLength: 80 },
          key: { type: "string", pattern: "^[a-z0-9]+(?:[._-][a-z0-9]+)*$" },
          content: { type: "string", minLength: 1, maxLength: 1200 },
          disciplineSpecific: { type: "boolean", description: "True only when the memory is specific to the current discipline rather than generally applicable." },
        },
        required: ["scope", "kind", "subject", "content"],
        additionalProperties: false,
      }),
      execute: async input => {
        const content = input.content.trim();
        const subject = input.subject.trim();
        if (!content || content.length > 1200 || !subject || subject.length > 80) return { saved: false, error: "Minnet har ogiltigt innehåll." };
        if (input.key && !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(input.key)) return { saved: false, error: "Minnets nyckel är ogiltig." };
        const row = {
          organization_id: scope.organizationId,
          discipline_id: input.disciplineSpecific ? scope.disciplineId : null,
          scope: input.scope,
          scope_id: scopeIds[input.scope],
          kind: input.kind,
          subject,
          memory_key: input.key ?? null,
          content,
          created_by: scope.userId,
        };
        const { error } = input.key
          ? await supabase.rpc("upsert_assistant_memory", {
              target_organization_id: row.organization_id,
              target_discipline_id: row.discipline_id,
              target_scope: row.scope,
              target_scope_id: row.scope_id,
              target_kind: row.kind,
              target_subject: row.subject,
              target_memory_key: input.key,
              target_content: row.content,
            })
          : await supabase.from("assistant_memories").insert(row);
        if (error) return { saved: false, error: error.code === "42501" ? "Du saknar behörighet att spara minne på den nivån." : "Minnet kunde inte sparas." };
        return { saved: true, scope: input.scope, kind: input.kind, content: row.content };
      },
    }),
  };
}
