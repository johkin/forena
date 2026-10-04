import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizationId, decideConsent, loadConsent } from "./consent";

const user = vi.fn();
const details = vi.fn();
const approve = vi.fn();
const deny = vi.fn();
const client = { auth: { getUser: user, oauth: { getAuthorizationDetails: details, approveAuthorization: approve, denyAuthorization: deny } } } as unknown as SupabaseClient;
const valid = () => ({ authorization_id: "request-1", user: { id: "user-1", email: "test@example.com" }, client: { id: "client-1", name: "Test client", uri: "", logo_uri: "" }, scope: "openid email", redirect_uri: "https://client.example/callback" });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FORENA_MCP_OAUTH_ENABLED", "true");
  vi.stubEnv("SITE_URL", "https://forena.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("FORENA_MCP_OAUTH_CLIENT_IDS", "client-1");
  user.mockResolvedValue({ data: { user: { id: "user-1", email: "test@example.com" } }, error: null });
  details.mockResolvedValue({ data: valid(), error: null });
  approve.mockResolvedValue({ data: { redirect_url: "https://client.example/callback?code=test&state=opaque" }, error: null });
  deny.mockResolvedValue({ data: { redirect_url: "https://client.example/callback?error=access_denied&state=opaque" }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("OAuth consent", () => {
  it("only accepts bounded opaque authorization IDs", () => {
    for (const value of [undefined, ["request-1"], "../request", "", "a".repeat(201)]) expect(authorizationId(value)).toBeNull();
    expect(authorizationId("request-1")).toBe("request-1");
  });
  it("requires a logged-in user before looking up consent", async () => {
    user.mockResolvedValue({ data: { user: null }, error: null });
    expect(await decideConsent(client, "request-1", "approve")).toEqual({ kind: "login" });
    expect(details).not.toHaveBeenCalled();
    expect(approve).not.toHaveBeenCalled();
  });
  it.each(["user", "client", "scope", "id", "redirect"])("rejects mismatched %s without approval", async field => {
    const data = valid();
    if (field === "user") data.user.id = "other";
    if (field === "client") data.client.id = "unknown";
    if (field === "scope") data.scope = "openid unknown";
    if (field === "id") data.authorization_id = "other";
    if (field === "redirect") data.redirect_uri = "javascript:evil";
    details.mockResolvedValue({ data, error: null });
    expect(await decideConsent(client, "request-1", "approve")).toEqual({ kind: "error" });
    expect(approve).not.toHaveBeenCalled();
  });
  it("re-fetches before approving and preserves issuer code/state", async () => {
    expect((await loadConsent(client, "request-1")).kind).toBe("consent");
    expect(await decideConsent(client, "request-1", "approve")).toEqual({ kind: "redirect", target: "https://client.example/callback?code=test&state=opaque" });
    expect(details).toHaveBeenCalledTimes(2);
    expect(approve).toHaveBeenCalledWith("request-1", { skipBrowserRedirect: true });
  });
  it("does not approve if client or user changed since rendering", async () => {
    expect((await loadConsent(client, "request-1")).kind).toBe("consent");
    const data = valid();
    data.client.id = "changed-client";
    details.mockResolvedValue({ data, error: null });
    expect(await decideConsent(client, "request-1", "approve")).toEqual({ kind: "error" });
    expect(approve).not.toHaveBeenCalled();
  });
  it("handles network exceptions without leaking diagnostics", async () => {
    details.mockRejectedValue(new Error("secret server details"));
    expect(await loadConsent(client, "request-1")).toEqual({ kind: "error" });
    details.mockResolvedValue({ data: valid(), error: null });
    approve.mockRejectedValue(new Error("secret server details"));
    expect(await decideConsent(client, "request-1", "approve")).toEqual({ kind: "error" });
  });
  it("denies explicitly without calling approve", async () => {
    expect((await decideConsent(client, "request-1", "deny")).kind).toBe("redirect");
    expect(deny).toHaveBeenCalledWith("request-1", { skipBrowserRedirect: true });
    expect(approve).not.toHaveBeenCalled();
  });
  it("rejects arbitrary decisions, expired requests and SDK errors", async () => {
    expect(await decideConsent(client, "request-1", "anything")).toEqual({ kind: "error" });
    expect(details).not.toHaveBeenCalled();
    details.mockResolvedValue({ data: null, error: { message: "sensitive" } });
    expect(await loadConsent(client, "request-1")).toEqual({ kind: "error" });
    details.mockResolvedValue({ data: valid(), error: null });
    approve.mockResolvedValue({ data: null, error: { message: "sensitive" } });
    expect(await decideConsent(client, "request-1", "approve")).toEqual({ kind: "error" });
  });
  it("only accepts safe SDK redirects matching the verified callback after a decision", async () => {
    approve.mockResolvedValue({ data: { redirect_url: "https://attacker.example/callback?code=x" }, error: null });
    expect(await decideConsent(client, "request-1", "approve")).toEqual({ kind: "error" });
    details.mockResolvedValue({ data: { redirect_url: "javascript:evil" }, error: null });
    expect(await loadConsent(client, "request-1")).toEqual({ kind: "error" });
    details.mockResolvedValue({ data: { redirect_url: "https://client.example/callback?code=already-approved" }, error: null });
    expect((await loadConsent(client, "request-1")).kind).toBe("redirect");
  });
  it("does not contact Auth when OAuth is disabled", async () => {
    vi.stubEnv("FORENA_MCP_OAUTH_ENABLED", "false");
    expect(await loadConsent(client, "request-1")).toEqual({ kind: "error" });
    expect(user).not.toHaveBeenCalled();
  });
});
