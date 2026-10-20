import { expect, it, vi } from "vitest";
import { authRequest, clearLegacyAuth, parseSession } from "./session";

const user = { id: "11111111-1111-4111-8111-111111111111", email: "family@example.invalid" };

it("uses same-origin cookies and a CSRF header for login without returning provider tokens", async () => {
  const transport = vi.fn().mockResolvedValue(Response.json({ user }));
  expect(parseSession(await authRequest("login", { email: user.email, password: "synthetic" }, transport))).toEqual({ user });
  expect(transport).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({
    method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
    headers: { "Content-Type": "application/json", "X-Forena-Request": "1" },
  }));
  expect(() => parseSession({ user, access_token: "unexpected" })).toThrow();
});

it("distinguishes an inactive app session from platform authentication and temporary failures", async () => {
  expect(await authRequest("session", undefined, vi.fn().mockResolvedValue(Response.json({ error: "Inloggning krävs." }, { status: 401 })))).toBeNull();
  for (const response of [new Response("Platform login", { status: 401 }), Response.json({ error: "unavailable" }, { status: 503 })]) {
    await expect(authRequest("session", undefined, vi.fn().mockResolvedValue(response))).rejects.toThrow();
  }
});

it("removes only the obsolete pilot Auth session and its auxiliary storage", () => {
  const storage = { removeItem: vi.fn() };
  clearLegacyAuth(storage);
  expect(storage.removeItem.mock.calls).toEqual([
    ["forena-kotlin-browser-auth"], ["forena-kotlin-browser-auth-code-verifier"], ["forena-kotlin-browser-auth-user"],
  ]);
});
