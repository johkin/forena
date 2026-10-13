import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMcpOAuthConfig, getMcpResourceUrl, isAllowedOAuthToken, mcpAuthenticationChallenge, protectedResourceMetadata } from "./oauth";
import { GET as rootMetadata } from "@/app/.well-known/oauth-protected-resource/route";
import { GET as pathMetadata } from "@/app/.well-known/oauth-protected-resource/api/mcp/route";

beforeEach(() => {
  vi.stubEnv("FORENA_MCP_OAUTH_ENABLED", "true");
  vi.stubEnv("FORENA_MCP_RESOURCE_URL", "");
  vi.stubEnv("FORENA_MCP_OAUTH_ISSUER_URL", "");
  vi.stubEnv("SITE_URL", "https://forena.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("FORENA_MCP_OAUTH_CLIENT_IDS", "client-1, client-2");
});
afterEach(() => vi.unstubAllEnvs());
describe("MCP OAuth discovery", () => {
  it("uses separate public MCP and issuer addresses consistently", async () => {
    vi.stubEnv("FORENA_MCP_RESOURCE_URL", "https://mcp.forena.example/api/mcp");
    vi.stubEnv("FORENA_MCP_OAUTH_ISSUER_URL", "https://auth.forena.example/auth/v1");
    const metadata = await protectedResourceMetadata().json();
    expect(metadata.resource).toBe("https://mcp.forena.example/api/mcp");
    expect(metadata.authorization_servers).toEqual(["https://auth.forena.example/auth/v1"]);
    expect(metadata.resource_documentation).toBe("https://forena.example/connect");
    expect(mcpAuthenticationChallenge()).toContain('resource_metadata="https://mcp.forena.example/.well-known/oauth-protected-resource/api/mcp"');
    expect(isAllowedOAuthToken({ client_id: "client-1", aud: metadata.resource })).toBe(true);
    expect(isAllowedOAuthToken({ client_id: "client-1", aud: "https://forena.example/api/mcp" })).toBe(false);
    vi.stubEnv("FORENA_MCP_OAUTH_ENABLED", "false");
    expect(getMcpResourceUrl("https://forena.example")).toBe(metadata.resource);
  });
  it("preserves the exact issuer path and trailing slash", () => {
    vi.stubEnv("FORENA_MCP_OAUTH_ISSUER_URL", "https://auth.forena.example/auth/v1/");
    expect(getMcpOAuthConfig()?.issuer).toBe("https://auth.forena.example/auth/v1/");
  });
  it.each(["FORENA_MCP_RESOURCE_URL", "FORENA_MCP_OAUTH_ISSUER_URL"])("fails closed for invalid override %s", name => {
    for (const value of ["not-a-url", "http://unsafe.example/api/mcp", "https://user:password@auth.example/api/mcp", "https://auth.example/api/mcp?query=1", "https://auth.example/api/mcp#fragment"]) {
      vi.stubEnv(name, value);
      expect(getMcpOAuthConfig()).toBeNull();
      expect(protectedResourceMetadata().status).toBe(503);
    }
  });
  it("rejects a resource path that this deployment does not serve", () => {
    vi.stubEnv("FORENA_MCP_RESOURCE_URL", "https://mcp.forena.example/other");
    expect(getMcpResourceUrl("https://forena.example")).toBeNull();
    expect(getMcpOAuthConfig()).toBeNull();
  });
  it("accepts local URLs only outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FORENA_MCP_RESOURCE_URL", "http://localhost:3000/api/mcp");
    vi.stubEnv("FORENA_MCP_OAUTH_ISSUER_URL", "http://127.0.0.1:54321/auth/v1");
    expect(getMcpOAuthConfig()).not.toBeNull();
    vi.stubEnv("NODE_ENV", "production");
    expect(getMcpOAuthConfig()).toBeNull();
  });
  it("publishes the same canonical resource and Supabase issuer at both paths", async () => {
    const root = await rootMetadata();
    const path = await pathMetadata();
    expect(await root.json()).toEqual(await path.json());
    const response = protectedResourceMetadata();
    expect(await response.json()).toEqual({ resource: "https://forena.example/api/mcp", authorization_servers: ["https://project.supabase.co/auth/v1"], scopes_supported: ["openid", "email", "profile"], bearer_methods_supported: ["header"], resource_documentation: "https://forena.example/connect" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mcpAuthenticationChallenge()).toContain('resource_metadata="https://forena.example/.well-known/oauth-protected-resource/api/mcp"');
  });
  it.each(["", "https://forena.example/path", "https://user:password@forena.example", "https://forena.example/?query=1", "http://unsafe.example", "javascript:evil"])("fails closed for invalid site %s", value => {
    vi.stubEnv("SITE_URL", value);
    expect(getMcpOAuthConfig()).toBeNull();
    expect(protectedResourceMetadata().status).toBe(503);
  });
  it("does not advertise OAuth without explicit opt-in and registered clients", () => {
    vi.stubEnv("FORENA_MCP_OAUTH_ENABLED", "false");
    expect(mcpAuthenticationChallenge()).toBe('Bearer realm="forena"');
    expect(protectedResourceMetadata().status).toBe(503);
    vi.stubEnv("FORENA_MCP_OAUTH_ENABLED", "true");
    vi.stubEnv("FORENA_MCP_OAUTH_CLIENT_IDS", "");
    expect(getMcpOAuthConfig()).toBeNull();
  });
  it("requires client allowlist and exact resource audience for OAuth tokens", () => {
    expect(isAllowedOAuthToken({ aud: "authenticated" })).toBe(true);
    expect(isAllowedOAuthToken({ client_id: "client-1", aud: "authenticated" })).toBe(false);
    expect(isAllowedOAuthToken({ client_id: "unknown", aud: "https://forena.example/api/mcp" })).toBe(false);
    expect(isAllowedOAuthToken({ client_id: "client-1", aud: ["authenticated", "https://forena.example/api/mcp"] })).toBe(true);
    vi.stubEnv("FORENA_MCP_OAUTH_ENABLED", "false");
    expect(isAllowedOAuthToken({ client_id: "client-1", aud: "https://forena.example/api/mcp" })).toBe(false);
  });
});
