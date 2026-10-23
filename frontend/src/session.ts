import { z } from "zod";

const sessionView = z.object({ user: z.object({ id: z.uuid(), email: z.string().nullable() }).strict() }).strict();
export type SessionView = z.infer<typeof sessionView>;

/** Only non-secret user information crosses this boundary. The session cookie is HttpOnly. */
export async function authRequest(path: "session" | "login" | "logout" | "passkey/options" | "passkey/verify" | "magic-link" | "magic-link/verify" | "passkey/registration/options" | "passkey/registration/verify" | "register" | "email/verify" | "password/reset-request" | "password/reset" | "continue", body?: unknown, transport: typeof fetch = fetch, accountId?: string, native = false) {
  const form = native && body !== undefined && ["login", "magic-link", "magic-link/verify", "logout"].includes(path);
  const values = body as Record<string, string>;
  const formBody = form ? new URLSearchParams(path === "login" ? { email: values.email, password: values.password }
    : path === "magic-link" ? { username: values.email } : path === "magic-link/verify" ? { token: values.code } : {}) : undefined;
  const response = await transport(`/api/auth/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin", cache: "no-store", redirect: "error",
    headers: body === undefined ? {} : { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json", "X-Forena-Request": "1", ...(accountId ? { "X-Forena-Account": accountId } : {}) },
    body: body === undefined ? undefined : formBody ?? JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 401 && response.headers.get("content-type")?.includes("application/json")) {
    const result = await response.clone().json().catch(() => null);
    if (["Inloggning krävs.", "Sessionen är inte aktiv."].includes(result?.error)) return null;
  }
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Inloggningen kunde inte genomföras. Försök igen.");
  return response.json() as Promise<unknown>;
}

export function parseSession(value: unknown): SessionView | null { return value === null ? null : sessionView.parse(value); }

function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
}
function encode(value: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The provider verifies the challenge/signature, RP ID and origin. No Supabase browser client is used. */
export async function passkeyLogin(native = false): Promise<SessionView | null> {
  if (!window.PublicKeyCredential || !navigator.credentials) throw new Error("Webbläsaren stöder inte passkey.");
  const optionsSchema = z.object({
    challenge: z.string(), rpId: z.string(), timeout: z.number().optional(),
    userVerification: z.enum(["required", "preferred", "discouraged"]).optional(),
    allowCredentials: z.array(z.object({ id: z.string(), type: z.literal("public-key") })).optional(),
  });
  const raw = await authRequest("passkey/options", {});
  const result = native ? { options: optionsSchema.parse(raw), challenge_id: undefined }
    : z.object({ challenge_id: z.uuid(), expires_at: z.number(), options: optionsSchema }).parse(raw);
  const hostname = window.location.hostname;
  if (hostname !== result.options.rpId && !hostname.endsWith(`.${result.options.rpId}`)) throw new Error("Passkey är inte konfigurerad för webbplatsen.");
  const credential = await navigator.credentials.get({ publicKey: {
    ...result.options, challenge: decode(result.options.challenge),
    allowCredentials: result.options.allowCredentials?.map(item => ({ ...item, id: decode(item.id) })),
  } }) as PublicKeyCredential | null;
  if (!credential) throw new Error("Inloggningen avbröts.");
  const assertion = credential.response as AuthenticatorAssertionResponse;
  const assertionPayload = {
      id: credential.id, rawId: encode(credential.rawId), type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment,
      clientExtensionResults: credential.getClientExtensionResults(),
      response: { clientDataJSON: encode(assertion.clientDataJSON), authenticatorData: encode(assertion.authenticatorData),
        signature: encode(assertion.signature), userHandle: assertion.userHandle ? encode(assertion.userHandle) : null },
  };
  return parseSession(await authRequest("passkey/verify", native ? assertionPayload : { challenge_id: result.challenge_id, credential: assertionPayload }));
}

export function clearLegacyAuth(storage: Pick<Storage, "removeItem"> = localStorage) {
  // Old sessions are deliberately not imported; users sign in again.
  for (const key of ["forena-kotlin-browser-auth", "forena-kotlin-browser-auth-code-verifier", "forena-kotlin-browser-auth-user"]) storage.removeItem(key);
}

/** Registration uses the authenticated server session; provider tokens never reach JavaScript. */
export async function registerPasskey(accountId: string, native = false): Promise<void> {
  if (!window.PublicKeyCredential || !navigator.credentials) throw new Error("Webbläsaren stöder inte passkey.");
  const descriptor = z.object({ id: z.string(), type: z.literal("public-key"),
    transports: z.array(z.enum(["ble", "hybrid", "internal", "nfc", "usb"])).optional() });
  const optionsSchema = z.object({
    challenge: z.string(), rp: z.object({ id: z.string(), name: z.string() }),
    user: z.object({ id: z.string(), name: z.string(), displayName: z.string() }),
    pubKeyCredParams: z.array(z.object({ type: z.literal("public-key"), alg: z.number() })),
    timeout: z.number().optional(), excludeCredentials: z.array(descriptor).optional(),
    authenticatorSelection: z.object({ authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
      residentKey: z.enum(["required", "preferred", "discouraged"]).optional(), requireResidentKey: z.boolean().optional(),
      userVerification: z.enum(["required", "preferred", "discouraged"]).optional() }).optional(),
    attestation: z.enum(["none", "indirect", "direct", "enterprise"]).optional(),
  });
  const raw = await authRequest("passkey/registration/options", {}, fetch, accountId);
  const result = native ? { options: optionsSchema.parse(raw), challenge_id: undefined }
    : z.object({ challenge_id: z.uuid(), expires_at: z.number(), options: optionsSchema }).parse(raw);
  const hostname = window.location.hostname;
  if (hostname !== result.options.rp.id && !hostname.endsWith(`.${result.options.rp.id}`)) throw new Error("Passkey är inte konfigurerad för webbplatsen.");
  const credential = await navigator.credentials.create({ publicKey: {
    ...result.options, challenge: decode(result.options.challenge), user: { ...result.options.user, id: decode(result.options.user.id) },
    excludeCredentials: result.options.excludeCredentials?.map(item => ({ ...item, id: decode(item.id) })),
  } }) as PublicKeyCredential | null;
  if (!credential) throw new DOMException("Registreringen avbröts.", "NotAllowedError");
  const attestation = credential.response as AuthenticatorAttestationResponse;
  const credentialPayload = {
    id: credential.id, rawId: encode(credential.rawId), type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment, clientExtensionResults: credential.getClientExtensionResults(),
    response: { clientDataJSON: encode(attestation.clientDataJSON), attestationObject: encode(attestation.attestationObject),
      transports: attestation.getTransports?.() ?? [] },
  };
  const verified = await authRequest("passkey/registration/verify", native ? { publicKey: { credential: credentialPayload, label: "Passkey" } }
    : { challenge_id: result.challenge_id, credential: credentialPayload }, fetch, accountId);
  if (native) z.object({ success: z.literal(true) }).parse(verified);
  else z.object({ ok: z.literal(true) }).parse(verified);
}
