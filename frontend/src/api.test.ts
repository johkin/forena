import { expect, it, vi } from "vitest";
import { createApiFetch, safeDestination } from "./api";

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
