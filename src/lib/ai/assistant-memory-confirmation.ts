import { normalizeMemoryDraft, type AssistantMemoryDraft } from "./assistant-memory-draft";
import type { AssistantDependencies } from "./team-assistant-types";

export type MemoryConfirmationResult = { saved: true; memoryId: string } | { saved: false; error: string };

async function canSave(draft: AssistantMemoryDraft, { supabase, userId }: AssistantDependencies): Promise<boolean> {
  if (draft.userId !== userId) return false;
  const { data: member, error } = await supabase.from("organization_members").select("role")
    .eq("organization_id", draft.organizationId).eq("user_id", userId).maybeSingle();
  if (error || !member) return false;
  const admin = member.role === "owner" || member.role === "admin";
  if (draft.scope === "personal") return draft.scopeId === userId;
  if (draft.scope === "organization") return draft.scopeId === draft.organizationId && admin;
  if (draft.scope === "section") {
    const { data: section, error: sectionError } = await supabase.from("sections").select("id")
      .eq("id", draft.scopeId).eq("organization_id", draft.organizationId).maybeSingle();
    if (sectionError || !section) return false;
    if (admin) return true;
    const permission = await supabase.rpc("has_section_role", { target_section_id: draft.scopeId, allowed_roles: ["section_admin"] });
    return !permission.error && permission.data === true;
  }
  const { data: team, error: teamError } = await supabase.from("teams").select("id")
    .eq("id", draft.scopeId).eq("organization_id", draft.organizationId).maybeSingle();
  if (teamError || !team) return false;
  const permission = await supabase.rpc("has_team_permission", { target_team_id: draft.scopeId, target_permission: "assistant.memory.manage" });
  return !permission.error && permission.data === true;
}

/** Called only by the explicit confirmation action, never exposed as an AI tool. */
export async function saveConfirmedMemory(value: unknown, dependencies: AssistantDependencies): Promise<MemoryConfirmationResult> {
  let draft: AssistantMemoryDraft;
  try { draft = normalizeMemoryDraft(value); }
  catch { return { saved: false, error: "Minnesförslaget är ogiltigt. Be assistenten om ett nytt." }; }
  if (!await canSave(draft, dependencies)) return { saved: false, error: "Du saknar nu behörighet att spara minnet på denna nivå." };
  const { supabase, userId } = dependencies;
  if (draft.key) {
    const { data, error } = await supabase.rpc("upsert_assistant_memory", {
      target_organization_id: draft.organizationId, target_scope: draft.scope, target_scope_id: draft.scopeId,
      target_discipline_id: draft.disciplineId, target_kind: draft.kind, target_subject: draft.subject,
      target_memory_key: draft.key, target_content: draft.content,
    });
    return !error && data ? { saved: true, memoryId: data } : { saved: false, error: "Minnet kunde inte sparas." };
  }
  const row = {
    id: draft.id, organization_id: draft.organizationId, scope: draft.scope, scope_id: draft.scopeId,
    discipline_id: draft.disciplineId, kind: draft.kind, subject: draft.subject,
    memory_key: null, content: draft.content, created_by: userId,
  };
  const { data, error } = await supabase.from("assistant_memories").insert(row).select("id").single();
  if (!error && data) return { saved: true, memoryId: data.id };
  if (error?.code === "23505") {
    // Repeated confirmation of this exact proposal must not create duplicates
    // or overwrite a memory that was subsequently edited.
    const existing = await supabase.from("assistant_memories")
      .select("id, organization_id, scope, scope_id, discipline_id, kind, subject, memory_key, content, created_by")
      .eq("id", draft.id).maybeSingle();
    const previous = existing.data;
    if (!existing.error && previous && Object.entries(row).every(([key, expected]) =>
      previous[key as keyof typeof previous] === expected)) return { saved: true, memoryId: draft.id };
  }
  return { saved: false, error: "Minnet kunde inte sparas. Det kan ha ändrats eller så saknas behörighet." };
}
