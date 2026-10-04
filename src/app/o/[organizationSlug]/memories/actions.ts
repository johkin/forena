"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MemoryScope } from "@/lib/ai/assistant-memory-draft";

const scopes = new Set(["personal", "organization", "section", "team"]);
const kinds = new Set(["fact", "preference", "instruction", "convention"]);

function destination(slug: string, scope: string, scopeId?: string) {
  const query = new URLSearchParams({ scope });
  if (scopeId) query.set("scopeId", scopeId);
  return `/o/${encodeURIComponent(slug)}/memories?${query}`;
}

async function context(formData: FormData) {
  const slug = String(formData.get("organizationSlug") ?? "");
  const scope = String(formData.get("scope") ?? "");
  const scopeId = String(formData.get("scopeId") ?? "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !scopes.has(scope)) redirect("/");
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const next = destination(slug, scope, scopeId || undefined);
  if (!authData.user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const { data: organization } = await supabase.from("organizations").select("id").eq("slug", slug).maybeSingle();
  if (!organization) redirect("/");
  const targetScopeId = scope === "personal" ? authData.user.id : scope === "organization" ? organization.id : scopeId;
  if (!targetScopeId) redirect(`${next}&error=${encodeURIComponent("Välj nivå först.")}`);
  return { supabase, user: authData.user, organization, slug, scope: scope as MemoryScope, scopeId: targetScopeId, next };
}

export async function createMemory(formData: FormData) {
  const ctx = await context(formData);
  const kind = String(formData.get("kind") ?? "instruction");
  const subject = String(formData.get("subject") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!kinds.has(kind) || !subject || subject.length > 80 || !content || content.length > 1200) {
    redirect(`${ctx.next}&error=${encodeURIComponent("Fyll i rubrik och minne.")}`);
  }
  const { error } = await ctx.supabase.from("assistant_memories").insert({
    organization_id: ctx.organization.id,
    scope: ctx.scope as "personal" | "organization" | "section" | "team",
    scope_id: ctx.scopeId,
    kind: kind as "fact" | "preference" | "instruction" | "convention",
    subject,
    content,
    created_by: ctx.user.id,
  });
  if (error) redirect(`${ctx.next}&error=${encodeURIComponent("Minnet kunde inte sparas. Kontrollera din behörighet.")}`);
  revalidatePath(`/o/${ctx.slug}/memories`);
  redirect(`${ctx.next}&saved=1`);
}

export async function updateMemory(formData: FormData) {
  const ctx = await context(formData);
  const id = String(formData.get("id") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  if (!id || !content || content.length > 1200) redirect(`${ctx.next}&error=${encodeURIComponent("Minnet har ogiltigt innehåll.")}`);
  const { data, error } = await ctx.supabase.from("assistant_memories").update({ content, updated_at: new Date().toISOString() })
    .eq("id", id).eq("organization_id", ctx.organization.id).eq("scope", ctx.scope).eq("scope_id", ctx.scopeId)
    .select("id").maybeSingle();
  if (error || !data) redirect(`${ctx.next}&error=${encodeURIComponent("Minnet kunde inte uppdateras. Det kan ha tagits bort eller så saknas behörighet.")}`);
  revalidatePath(`/o/${ctx.slug}/memories`);
  redirect(`${ctx.next}&saved=1`);
}

export async function deleteMemory(formData: FormData) {
  const ctx = await context(formData);
  const id = String(formData.get("id") ?? "");
  if (!id) redirect(ctx.next);
  const { data, error } = await ctx.supabase.from("assistant_memories").delete()
    .eq("id", id).eq("organization_id", ctx.organization.id).eq("scope", ctx.scope).eq("scope_id", ctx.scopeId)
    .select("id").maybeSingle();
  if (error || !data) redirect(`${ctx.next}&error=${encodeURIComponent("Minnet kunde inte tas bort. Det kan redan vara borttaget eller så saknas behörighet.")}`);
  revalidatePath(`/o/${ctx.slug}/memories`);
  redirect(`${ctx.next}&deleted=1`);
}
