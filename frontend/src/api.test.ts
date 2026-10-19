import { expect, it, vi } from "vitest";
import { createApiFetch, safeDestination } from "./api";

const id = "11111111-1111-4111-8111-111111111111";
const path = `/api/activities/${id}/my-invitations`;

it("reads the latest token per request and never sends ambient cookies or follows redirects", async () => {
  const token = vi.fn().mockResolvedValueOnce("first-session").mockResolvedValueOnce("refreshed-session");
  const transport = vi.fn().mockResolvedValue(Response.json({ invitations: [] }));
  const request = createApiFetch(token, vi.fn(), transport);
  await request(path);
  await request(path);
  expect(new Headers(transport.mock.calls[0][1].headers).get("Authorization")).toBe("Bearer first-session");
  expect(new Headers(transport.mock.calls[1][1].headers).get("Authorization")).toBe("Bearer refreshed-session");
  expect(transport.mock.calls[0][1]).toMatchObject({ credentials: "omit", cache: "no-store", redirect: "error" });
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
it("does not retry a write when the server denies a revoked session", async () => {
  const unauthorized = vi.fn(), transport = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
  await createApiFetch(async () => "revoked-session", unauthorized, transport)(`/api/invitations/${id}/respond`, { method: "PUT", body: '{"response":"accepted"}' });
  expect(unauthorized).toHaveBeenCalledOnce(); expect(transport).toHaveBeenCalledOnce();
});
it.each(["//other.test", "https://other.test", "/\\other.test", "/api/unknown"])("does not use an external or unsupported login return path: %s", value => {
  expect(safeDestination(value)).toBe("/");
});
it("keeps activity deep links across login", () => expect(safeDestination(`/activities/${id}`)).toBe(`/activities/${id}`));
