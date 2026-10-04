import { randomUUID } from "node:crypto";
import { jsonSchema, tool } from "ai";
import { memoryScopeLabels, normalizeMemoryInput, type AssistantMemoryDraft, type MemoryInput, type MemoryScope } from "./assistant-memory-draft";

export type AssistantMemoryScope = {
  organizationId: string;
  sectionId: string;
  teamId: string;
  userId: string;
  disciplineId: string | null;
  organizationName?: string;
  sectionName?: string;
  teamName?: string;
};

/** This tool deliberately has no database client or persistence capability. */
export function createAssistantMemoryTools(scope: AssistantMemoryScope, onDraft: (draft: AssistantMemoryDraft) => void) {
  const scopeIds: Record<MemoryScope, string> = {
    personal: scope.userId, team: scope.teamId, section: scope.sectionId, organization: scope.organizationId,
  };
  const scopeNames: Record<MemoryScope, string> = {
    personal: "Mina minnen", team: scope.teamName ?? "Laget",
    section: scope.sectionName ?? "Sektionen", organization: scope.organizationName ?? "Föreningen",
  };
  const proposed = new Set<string>();
  return {
    remember: tool({
      description: "Föreslå ett beständigt minne. Verktyget sparar ingenting. Användaren måste granska den exakta texten och nivån och klicka Spara minne. Föreslå inte känsliga personuppgifter, hälsouppgifter, kallelsesvar, tillfälliga planer eller fakta som redan finns i Förena.",
      inputSchema: jsonSchema<MemoryInput>({
        type: "object",
        properties: {
          scope: { type: "string", enum: ["personal", "team", "section", "organization"] },
          kind: { type: "string", enum: ["fact", "preference", "instruction", "convention"] },
          subject: { type: "string", minLength: 1, maxLength: 80 },
          key: { type: "string", maxLength: 120, pattern: "^[a-z0-9]+(?:[._-][a-z0-9]+)*$" },
          content: { type: "string", minLength: 1, maxLength: 1200 },
          disciplineSpecific: { type: "boolean", description: "Gäller bara den aktuella disciplinen, inte verksamheten generellt." },
        },
        required: ["scope", "kind", "subject", "content"],
        additionalProperties: false,
      }),
      execute: async value => {
        try {
          const input = normalizeMemoryInput(value);
          if (input.disciplineSpecific && !scope.disciplineId) return { proposed: false, saved: false, error: "Ingen disciplin är vald för laget." };
          const fingerprint = JSON.stringify(input);
          if (proposed.has(fingerprint)) return { proposed: true, saved: false, requiresConfirmation: true };
          if (proposed.size >= 3) return { proposed: false, saved: false, error: "Granska de befintliga förslagen först." };
          const draft: AssistantMemoryDraft = {
            id: randomUUID(), userId: scope.userId, organizationId: scope.organizationId,
            scope: input.scope, scopeId: scopeIds[input.scope], scopeName: scopeNames[input.scope],
            disciplineId: input.disciplineSpecific ? scope.disciplineId : null,
            kind: input.kind, subject: input.subject, key: input.key ?? null, content: input.content,
          };
          proposed.add(fingerprint);
          onDraft(draft);
          return { proposed: true, saved: false, requiresConfirmation: true, scope: memoryScopeLabels[draft.scope], content: draft.content };
        } catch (error) {
          return { proposed: false, saved: false, error: error instanceof Error ? error.message : "Ogiltigt minnesförslag." };
        }
      },
    }),
  };
}
