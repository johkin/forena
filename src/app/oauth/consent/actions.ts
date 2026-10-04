"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authorizationId, decideConsent } from "@/lib/mcp/consent";
import { getMcpOAuthConfig } from "@/lib/mcp/oauth";

export async function submitConsent(form: FormData) {
  const id = authorizationId(form.get("authorization_id"));
  if (!id || !getMcpOAuthConfig()) redirect("/oauth/consent?error=1");
  const result = await decideConsent(await createClient(), id, String(form.get("decision") ?? ""));
  if (result.kind === "login") redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${id}`)}`);
  if (result.kind === "redirect") redirect(result.target);
  redirect("/oauth/consent?error=1");
}
