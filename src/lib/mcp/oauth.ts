function configuredUrl(value: string) {
  const url = new URL(value);
  const local = process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((url.protocol !== "https:" && !local) || url.username || url.password || url.search || url.hash) throw new Error("Invalid MCP URL");
  return url;
}

/** The deployment still serves /api/mcp, possibly through a separate public host. */
export function getMcpResourceUrl(siteUrl: string) {
  try {
    const resource = configuredUrl(process.env.FORENA_MCP_RESOURCE_URL?.trim() || new URL("/api/mcp", siteUrl).href);
    return resource.pathname === "/api/mcp" ? resource.href : null;
  } catch { return null; }
}

/** Explicit opt-in: never derive OAuth identifiers from an incoming Host header. */
export function getMcpOAuthConfig() {
  if (process.env.FORENA_MCP_OAUTH_ENABLED !== "true") return null;
  try {
    const site = configuredUrl(process.env.SITE_URL ?? "");
    if (site.pathname !== "/") return null;
    const resource = getMcpResourceUrl(site.href);
    if (!resource) return null;
    const explicitIssuer = process.env.FORENA_MCP_OAUTH_ISSUER_URL?.trim();
    let issuer: string;
    if (explicitIssuer) {
      // Issuer paths and trailing slashes are significant; do not append /auth/v1.
      configuredUrl(explicitIssuer);
      issuer = explicitIssuer;
    } else {
      const supabase = configuredUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
      if (supabase.pathname !== "/") return null;
      issuer = `${supabase.origin}/auth/v1`;
    }
    const clientIds = (process.env.FORENA_MCP_OAUTH_CLIENT_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
    if (!clientIds.length || clientIds.some((id) => !/^[a-zA-Z0-9_-]{1,200}$/.test(id))) return null;
    return { resource, metadataUrl: new URL("/.well-known/oauth-protected-resource/api/mcp", resource).href, issuer, documentationUrl: `${site.origin}/connect`, clientIds };
  } catch { return null; }
}

export const oauthScopes = ["openid", "email", "profile"];

export function protectedResourceMetadata() {
  const config = getMcpOAuthConfig();
  const headers = { "Cache-Control": "no-store" };
  if (!config) return Response.json({ error: "OAuth is not configured" }, { status: 503, headers });
  return Response.json({ resource: config.resource, authorization_servers: [config.issuer], scopes_supported: oauthScopes, bearer_methods_supported: ["header"], resource_documentation: config.documentationUrl }, { headers });
}

export function mcpAuthenticationChallenge() {
  const config = getMcpOAuthConfig();
  return config ? `Bearer realm="forena", resource_metadata="${config.metadataUrl}"` : 'Bearer realm="forena"';
}

export function isAllowedOAuthToken(claims: Record<string, unknown>) {
  // Manual user tokens remain supported. OAuth tokens must be bound to this resource.
  if (!("client_id" in claims)) return true;
  const config = getMcpOAuthConfig();
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  return Boolean(config && typeof claims.client_id === "string" && config.clientIds.includes(claims.client_id) && audiences.includes(config.resource));
}
