import { expect, it, vi } from "vitest";
import { createApiFetch, oauthDestination, safeDestination } from "./api";

const id = "11111111-1111-4111-8111-111111111111";
const path = `/api/activities/${id}/my-invitations`;

it("uses HttpOnly cookies without exposing a Bearer token", async () => {
  const transport = vi.fn().mockResolvedValue(Response.json({ invitations: [] }));
  const request = createApiFetch(async () => id, vi.fn(), transport);
  await request(path, { headers: { Authorization: "Bearer unwanted" } });
  expect(new Headers(transport.mock.calls[0][1].headers).get("Authorization")).toBeNull();
  expect(transport.mock.calls[0][1]).toMatchObject({ credentials: "same-origin", cache: "no-store", redirect: "error" });
});
it.each(["https://other.test/api", "//other.test/api", "/api/not-supported", path + "?token=secret", "/api/activities/invalid/my-invitations"])("rejects unsafe or unsupported destinations before reading a token: %s", async url => {
  const token = vi.fn(); const transport = vi.fn();
  await expect(createApiFetch(token, vi.fn(), transport)(url)).rejects.toThrow();
  expect(token).not.toHaveBeenCalled(); expect(transport).not.toHaveBeenCalled();
});
it("requires a session and clears private UI without dispatching an unauthenticated read", async () => {
  const unauthorized = vi.fn(), transport = vi.fn();
  expect((await createApiFetch(async () => null, unauthorized, transport)(path)).status).toBe(401);
  expect(unauthorized).toHaveBeenCalledOnce(); expect(transport).not.toHaveBeenCalled();
});
it.each(["Inloggning krävs.", "Sessionen är inte aktiv."])("does not retry a write when the server denies the session: %s", async error => {
  const unauthorized = vi.fn(), transport = vi.fn().mockResolvedValue(Response.json({ error }, { status: 401 }));
  await createApiFetch(async () => id, unauthorized, transport)(`/api/invitations/${id}/respond`, { method: "PUT", body: '{"response":"accepted"}' });
  expect(unauthorized).toHaveBeenCalledOnce(); expect(transport).toHaveBeenCalledOnce();
  expect(new Headers(transport.mock.calls[0][1].headers).get("X-Forena-Request")).toBe("1");
});
it.each([
  new Response("<html>Vercel Authentication</html>", { status: 401, headers: { "content-type": "text/html" } }),
  Response.json({ error: "deployment_authentication_required" }, { status: 401 }),
  new Response("not json", { status: 401, headers: { "content-type": "application/json" } }),
])("preserves the app session when an intermediary denies access", async response => {
  const unauthorized = vi.fn();
  const result = await createApiFetch(async () => id, unauthorized, vi.fn().mockResolvedValue(response))(path);
  expect(result.status).toBe(401);
  expect(unauthorized).not.toHaveBeenCalled();
  expect(await result.text()).not.toBe("");
});
it.each(["//other.test", "https://other.test", "/\\other.test", "/api/unknown"])("does not use an external or unsupported login return path: %s", value => {
  expect(safeDestination(value)).toBe("/");
});
it("keeps activity deep links across login", () => expect(safeDestination(`/activities/${id}`)).toBe(`/activities/${id}`));

it("allows only bounded overview read paths", async () => {
  const transport = vi.fn().mockResolvedValue(Response.json({ activities: [], next_offset: null }));
  const request = createApiFetch(async () => id, vi.fn(), transport);
  await request("/api/me/activities");
  await request("/api/me/activities?offset=50");
  await expect(request("/api/me/activities?subject=someone")).rejects.toThrow();
  await expect(request("/api/me/activities?offset=-1")).rejects.toThrow();
  await expect(request("/api/me/activities", { method: "PUT" })).rejects.toThrow();
  expect(transport).toHaveBeenCalledTimes(2);
});

it("allowlists the complete overview and exact activity reads while rejecting scope overrides",async()=>{
 const transport=vi.fn().mockResolvedValue(Response.json({}));const request=createApiFetch(async()=>id,vi.fn(),transport);
 await request("/api/me/overview");await request(`/api/activities/${id}`);
 await expect(request("/api/me/overview?subject=other")).rejects.toThrow();
 await expect(request(`/api/activities/${id}?person=other`)).rejects.toThrow();
 expect(transport).toHaveBeenCalledTimes(2);
 expect(safeDestination(`/teams/${id}`)).toBe(`/teams/${id}`);
 expect(safeDestination(`/organizations/${id}`)).toBe(`/organizations/${id}`);
});


it("preserves an OAuth authorization query without allowing it as an ordinary SPA destination", () => {
  const next = "/oauth2/authorize?client_id=test&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&state=a%2Bb&resource=https%3A%2F%2Fapp.example%2Fapi%2Fmcp";
  expect(oauthDestination(next)).toBe(next);
  expect(safeDestination(next)).toBe("/");
});

it.each([null, "/", "//evil.example/oauth2/authorize?x=1", "https://evil.example/oauth2/authorize?x=1", "/oauth2/authorize", "/oauth2/authorize?", "/oauth2/authorize/../evil?x=1", "/oauth2/authorize?x=1#evil", "/oauth2/authorize?x=1\\evil", "/oauth2/authorize?x=1\n"])("rejects unsafe OAuth continuation %s", value => {
  expect(oauthDestination(value)).toBeUndefined();
});

it("binds activity commands to the current account and exact managed routes", async () => {
  const transport = vi.fn().mockResolvedValue(Response.json({}));
  const request = createApiFetch(async () => id, vi.fn(), transport);
  await request("/api/me/managed-teams");
  await request(`/api/teams/${id}/activity-editor`);
  await request("/api/activities", { method: "POST", body: "{}" });
  await request(`/api/activities/${id}`, { method: "PUT", body: "{}" });
  await request(`/api/activities/${id}`, { method: "DELETE", body: "{}" });
  for (const call of transport.mock.calls.slice(2)) {
    expect(new Headers(call[1].headers).get("X-Forena-Account")).toBe(id);
    expect(new Headers(call[1].headers).get("X-Forena-Request")).toBe("1");
  }
  await expect(request("/api/activities?team=other", { method: "POST" })).rejects.toThrow();
  await expect(request(`/api/teams/${id}/activity-editor?subject=other`)).rejects.toThrow();
  await expect(request(`/api/teams/${id}/activity-editor`, { method: "POST" })).rejects.toThrow();
});

it("restricts administration to exact routes and bounded slug checks", async () => {
  const transport = vi.fn().mockResolvedValue(Response.json({}));
  const request = createApiFetch(async () => id, vi.fn(), transport);
  await request("/api/admin/overview");
  await request("/api/admin/slug?slug=exempelklubben");
  await request(`/api/admin/slug?slug=exempelklubben&organizationId=${id}`);
  await request("/api/admin/bootstrap", { method: "POST", body: "{}" });
  await request(`/api/admin/clubs/${id}/sections/${id}`, { method: "PUT", body: "{}" });
  await request(`/api/admin/sections/${id}/teams/${id}`, { method: "PUT", body: "{}" });
  await request(`/api/admin/teams/${id}/administrators`, { method: "POST", body: "{}" });
  await expect(request("/api/admin/overview?subject=other")).rejects.toThrow();
  await expect(request("/api/admin/slug?slug=test&extra=1")).rejects.toThrow();
  await expect(request("/api/admin/unknown", { method: "POST" })).rejects.toThrow();
  expect(safeDestination("/administration")).toBe("/administration");
});

it("allows atomic series creation with account and CSRF binding, without widening other routes", async () => {
  const transport = vi.fn().mockResolvedValue(Response.json({ count: 3 }));
  const request = createApiFetch(async () => id, vi.fn(), transport);
  await request("/api/activity-series", { method: "POST", body: "{}" });
  expect(transport).toHaveBeenCalledOnce();
  const headers = new Headers(transport.mock.calls[0][1].headers);
  expect(headers.get("X-Forena-Account")).toBe(id);
  expect(headers.get("X-Forena-Request")).toBe("1");
  await expect(request("/api/activity-series")).rejects.toThrow();
  await expect(request("/api/activity-series", { method: "PUT" })).rejects.toThrow();
  await expect(request("/api/activity-series?team=other", { method: "POST" })).rejects.toThrow();
});
