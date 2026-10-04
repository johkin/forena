import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateMcp } from "./auth";
const mocks = vi.hoisted(() => ({ client: vi.fn(), claims: vi.fn(), user: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.client }));
vi.mock("@/lib/supabase/env", () => ({ getSupabaseEnvironment: () => ({ url: "http://localhost:54321", publishableKey: "publishable" }) }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockReturnValue({ auth: { getClaims: mocks.claims, getUser: mocks.user } });
  mocks.claims.mockResolvedValue({ data: { claims: { role: "authenticated", sub: "user" } }, error: null });
  mocks.user.mockResolvedValue({ data: { user: { id: "user" } }, error: null });
});
const request = (authorization?: string) => new Request("http://localhost/api/mcp", { headers: authorization ? { authorization } : { cookie: "session=browser-cookie" } });
afterEach(() => vi.unstubAllEnvs());
describe("MCP bearer authentication", () => {
  it("rejects OAuth tokens until client and resource audience are verified", async () => {
    vi.stubEnv("FORENA_MCP_OAUTH_ENABLED", "true");
    vi.stubEnv("FORENA_MCP_OAUTH_CLIENT_IDS", "client-1");
    vi.stubEnv("SITE_URL", "https://forena.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    const claims = { role: "authenticated", sub: "user", client_id: "client-1", aud: "authenticated" };
    mocks.claims.mockResolvedValue({ data: { claims }, error: null });
    expect(await authenticateMcp(request("Bearer token"))).toBeNull();
    expect(mocks.user).not.toHaveBeenCalled();
    mocks.claims.mockResolvedValue({ data: { claims: { ...claims, aud: ["authenticated", "https://forena.example/api/mcp"] } }, error: null });
    expect(await authenticateMcp(request("Bearer token"))).toMatchObject({ userId: "user" });
  });
  it("does not accept cookies or malformed authorization", async () => {
    for (const header of [undefined, "Basic token", "Bearer token extra", "Bearer "]) expect(await authenticateMcp(request(header))).toBeNull();
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("uses a request-local client with the publishable key and user token", async () => {
    expect(await authenticateMcp(request("Bearer user-token"))).toMatchObject({ userId: "user" });
    expect(mocks.client).toHaveBeenCalledWith("http://localhost:54321", "publishable", expect.objectContaining({
      global: { headers: { Authorization: "Bearer user-token" } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }));
    expect(mocks.user).toHaveBeenCalledWith("user-token");
  });
  it.each(["anon", "service_role"])("rejects %s tokens", async role => {
    mocks.claims.mockResolvedValue({ data: { claims: { role, sub: "user" } }, error: null });
    expect(await authenticateMcp(request("Bearer token"))).toBeNull();
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it("rejects invalid or expired tokens", async () => {
    mocks.claims.mockResolvedValue({ data: null, error: new Error("expired") });
    expect(await authenticateMcp(request("Bearer token"))).toBeNull();
  });
  it("rejects removed users and mismatched identities", async () => {
    mocks.user.mockResolvedValue({ data: { user: null }, error: new Error("removed") });
    expect(await authenticateMcp(request("Bearer token"))).toBeNull();
    mocks.user.mockResolvedValue({ data: { user: { id: "someone-else" } }, error: null });
    expect(await authenticateMcp(request("Bearer token"))).toBeNull();
  });
});
