import { expect, it, vi } from "vitest";
import { authRequest, clearLegacyAuth, parseSession } from "./session";

const user = { id: "11111111-1111-4111-8111-111111111111", email: "family@example.invalid" };

it("uses same-origin cookies and a CSRF header for login without returning provider tokens", async () => {
  const transport = vi.fn().mockResolvedValue(Response.json({ user }));
  expect(parseSession(await authRequest("login", { email: user.email, password: "synthetic" }, transport))).toEqual({ user });
  expect(transport).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({
    method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Forena-Request": "1" },
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

it("registers a passkey with binary WebAuthn fields and binds both requests to the displayed account", async () => {
  const { registerPasskey } = await import("./session");
  const create = vi.fn().mockResolvedValue({ id: "credential", rawId: new Uint8Array([1, 2]).buffer,
    type: "public-key", authenticatorAttachment: "platform", getClientExtensionResults: () => ({ credProps: { rk: true } }),
    response: { clientDataJSON: new Uint8Array([3, 4]).buffer, attestationObject: new Uint8Array([5, 6]).buffer,
      getTransports: () => ["internal", "hybrid"] },
  });
  const transport = vi.fn().mockResolvedValueOnce(Response.json({
    challenge: "AQI", rp: { id: "localhost", name: "Förena" }, user: { id: "AwQ", name: user.email, displayName: "Family" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }], excludeCredentials: [{ id: "BQY", type: "public-key" }],
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  })).mockResolvedValueOnce(Response.json({ success: true }));
  vi.stubGlobal("window", { PublicKeyCredential: class {}, location: { hostname: "localhost" } });
  vi.stubGlobal("navigator", { credentials: { create } });
  vi.stubGlobal("fetch", transport);
  try {
    await registerPasskey(user.id);
    const options = create.mock.calls[0][0].publicKey;
    expect([...options.challenge]).toEqual([1, 2]);
    expect([...options.user.id]).toEqual([3, 4]);
    expect([...options.excludeCredentials[0].id]).toEqual([5, 6]);
    expect(options.authenticatorSelection).toEqual({ residentKey: "required", userVerification: "required" });
    expect(transport.mock.calls.map(call => call[1].headers["X-Forena-Account"])).toEqual([user.id, user.id]);
    expect(JSON.parse(transport.mock.calls[1][1].body)).toMatchObject({ publicKey: { credential: { rawId: "AQI", response: { clientDataJSON: "AwQ", attestationObject: "BQY", transports: ["internal", "hybrid"] } } } });
  } finally { vi.unstubAllGlobals(); }
});

it("does not invoke an authenticator or verification for an unrelated relying party", async () => {
  const { registerPasskey } = await import("./session");
  const create = vi.fn();
  const transport = vi.fn().mockResolvedValue(Response.json({ challenge: "AQI", rp: { id: "other.example", name: "Other" }, user: { id: "AwQ", name: "family", displayName: "Family" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }] }));
  vi.stubGlobal("window", { PublicKeyCredential: class {}, location: { hostname: "localhost" } });
  vi.stubGlobal("navigator", { credentials: { create } });
  vi.stubGlobal("fetch", transport);
  try {
    await expect(registerPasskey(user.id)).rejects.toThrow("Passkey är inte konfigurerad");
    expect(create).not.toHaveBeenCalled();
    expect(transport).toHaveBeenCalledTimes(1);
  } finally { vi.unstubAllGlobals(); }
});

it("uses Spring form field names for password and one-time-token login", async () => {
  for (const [path, body, expected] of [
    ["login", { email: user.email, password: "synthetic" }, { email: user.email, password: "synthetic" }],
    ["magic-link", { email: user.email }, { username: user.email }],
    ["magic-link/verify", { code: "synthetic-token" }, { token: "synthetic-token" }],
  ] as const) {
    const transport = vi.fn().mockResolvedValue(Response.json({ user }));
    await authRequest(path, body, transport);
    const request = transport.mock.calls[0][1];
    expect(request.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(Object.fromEntries(request.body)).toEqual(expected);
    expect(request.credentials).toBe("same-origin");
  }
});
