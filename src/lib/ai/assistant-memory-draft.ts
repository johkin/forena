export const memoryScopes = ["personal", "team", "section", "organization"] as const;
export const memoryKinds = ["fact", "preference", "instruction", "convention"] as const;
export type MemoryScope = typeof memoryScopes[number];
export type MemoryKind = typeof memoryKinds[number];
export type MemoryInput = {
  scope: MemoryScope;
  kind: MemoryKind;
  subject: string;
  key?: string;
  content: string;
  disciplineSpecific?: boolean;
};

/** A proposal is presentation data, not permission to persist a memory. */
export type AssistantMemoryDraft = {
  id: string;
  userId: string;
  organizationId: string;
  scope: MemoryScope;
  scopeId: string;
  scopeName: string;
  disciplineId: string | null;
  kind: MemoryKind;
  subject: string;
  key: string | null;
  content: string;
};

export const memoryScopeLabels: Record<MemoryScope, string> = {
  personal: "Personligt", team: "Lag", section: "Sektion", organization: "Klubb",
};

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Ogiltigt minnesförslag.");
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error("Minnet har ogiltigt innehåll.");
  return value.trim();
}

export function normalizeMemoryInput(value: unknown): MemoryInput {
  const input = record(value);
  if (!memoryScopes.includes(input.scope as MemoryScope) || !memoryKinds.includes(input.kind as MemoryKind)) throw new Error("Ogiltig minnesnivå eller typ.");
  if (input.disciplineSpecific !== undefined && typeof input.disciplineSpecific !== "boolean") throw new Error("Ogiltigt disciplinval.");
  const key = input.key === undefined || input.key === null ? undefined : text(input.key, 120);
  if (key && !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(key)) throw new Error("Minnets nyckel är ogiltig.");
  return {
    scope: input.scope as MemoryScope,
    kind: input.kind as MemoryKind,
    subject: text(input.subject, 80),
    content: text(input.content, 1200),
    key,
    disciplineSpecific: input.disciplineSpecific as boolean | undefined,
  };
}

/** Revalidate every field at the separate, authenticated confirmation boundary. */
export function normalizeMemoryDraft(value: unknown): AssistantMemoryDraft {
  const draft = record(value);
  const input = normalizeMemoryInput(draft);
  if (!isUuid(draft.id) || !isUuid(draft.userId) || !isUuid(draft.organizationId) || !isUuid(draft.scopeId)
    || (draft.disciplineId !== null && !isUuid(draft.disciplineId))) throw new Error("Ogiltigt mål för minnet.");
  return {
    id: draft.id, userId: draft.userId, organizationId: draft.organizationId,
    scope: input.scope, scopeId: draft.scopeId, scopeName: text(draft.scopeName, 120),
    disciplineId: draft.disciplineId, kind: input.kind,
    subject: input.subject, key: input.key ?? null, content: input.content,
  };
}
