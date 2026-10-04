import type { SupabaseClient } from "@supabase/supabase-js";
import { getMcpOAuthConfig, oauthScopes } from "@/lib/mcp/oauth";

export function authorizationId(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(value) ? value : null;
}

function redirectUrl(value: string) {
  try {
    const url = new URL(value);
    const local = process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    return (url.protocol === "https:" || local) && !url.username && !url.password && !url.hash ? url : null;
  } catch { return null; }
}

/** Fetch and validate again for each POST; no client-submitted permissions or redirect. */
export async function loadConsent(supabase: SupabaseClient, id: string) {
  try { return await verifiedConsent(supabase, id); }
  catch { return { kind: "error" as const }; }
}

async function verifiedConsent(supabase: SupabaseClient, id: string) {
  const config = getMcpOAuthConfig();
  if (!config || !authorizationId(id)) return { kind: "error" as const };
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { kind: "login" as const };
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
  if (error || !data) return { kind: "error" as const };
  if ("redirect_url" in data) {
    const target = redirectUrl(data.redirect_url);
    return target ? { kind: "redirect" as const, target: target.href } : { kind: "error" as const };
  }
  const scopes = data.scope.split(/\s+/).filter(Boolean);
  if (data.authorization_id !== id || data.user.id !== userData.user.id || !config.clientIds.includes(data.client.id) || scopes.some((scope) => !oauthScopes.includes(scope)) || !redirectUrl(data.redirect_uri)) return { kind: "error" as const };
  return { kind: "consent" as const, details: data, scopes, email: userData.user.email };
}

export async function decideConsent(supabase: SupabaseClient, id: string, decision: string) {
  try { return await verifiedDecision(supabase, id, decision); }
  catch { return { kind: "error" as const }; }
}

async function verifiedDecision(supabase: SupabaseClient, id: string, decision: string) {
  if (decision !== "approve" && decision !== "deny") return { kind: "error" as const };
  const consent = await loadConsent(supabase, id);
  if (consent.kind !== "consent") return consent;
  const result = decision === "approve"
    ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
  if (result.error || !result.data) return { kind: "error" as const };
  const target = redirectUrl(result.data.redirect_url);
  const expected = new URL(consent.details.redirect_uri);
  if (!target || target.origin !== expected.origin || target.pathname !== expected.pathname) return { kind: "error" as const };
  return { kind: "redirect" as const, target: target.href };
}
