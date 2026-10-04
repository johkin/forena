import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMcpOAuthConfig, isAllowedOAuthToken, mcpAuthenticationChallenge, protectedResourceMetadata } from "./oauth";
import { GET as rootMetadata } from "@/app/.well-known/oauth-protected-resource/route";
import { GET as pathMetadata } from "@/app/.well-known/oauth-protected-resource/api/mcp/route";

beforeEach(() => {
  vi.stubEnv("FORENA_MCP_OAUTH_ENABLED", "true");
  vi.stubEnv("SITE_URL", "https://forena.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("FORENA_MCP_OAUTH_CLIENT_IDS", "client-1, client-2");
});
afterEach(() => vi.unstubAllEnvs());
describe("MCP OAuth discovery", () => {
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
