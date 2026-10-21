import { z } from "zod";

const sessionView = z.object({ user: z.object({ id: z.uuid(), email: z.string().nullable() }).strict() }).strict();
export type SessionView = z.infer<typeof sessionView>;

/** Only non-secret user information crosses this boundary. The session cookie is HttpOnly. */
export async function authRequest(path: "session" | "login" | "logout" | "passkey/options" | "passkey/verify", body?: unknown, transport: typeof fetch = fetch) {
  const response = await transport(`/api/auth/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin", cache: "no-store", redirect: "error",
    headers: body === undefined ? {} : { "Content-Type": "application/json", "X-Forena-Request": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
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
export async function passkeyLogin(): Promise<SessionView | null> {
  if (!window.PublicKeyCredential || !navigator.credentials) throw new Error("Webbläsaren stöder inte passkey.");
  const result = z.object({ challenge_id: z.uuid(), expires_at: z.number(), options: z.object({
    challenge: z.string(), rpId: z.string(), timeout: z.number().optional(),
    userVerification: z.enum(["required", "preferred", "discouraged"]).optional(),
    allowCredentials: z.array(z.object({ id: z.string(), type: z.literal("public-key") })).optional(),
  }) }).parse(await authRequest("passkey/options", {}));
  const hostname = window.location.hostname;
  if (hostname !== result.options.rpId && !hostname.endsWith(`.${result.options.rpId}`)) throw new Error("Passkey är inte konfigurerad för webbplatsen.");
  const credential = await navigator.credentials.get({ publicKey: {
    ...result.options, challenge: decode(result.options.challenge),
    allowCredentials: result.options.allowCredentials?.map(item => ({ ...item, id: decode(item.id) })),
  } }) as PublicKeyCredential | null;
  if (!credential) throw new Error("Inloggningen avbröts.");
  const assertion = credential.response as AuthenticatorAssertionResponse;
  return parseSession(await authRequest("passkey/verify", {
    challenge_id: result.challenge_id,
    credential: {
      id: credential.id, rawId: encode(credential.rawId), type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment,
      clientExtensionResults: credential.getClientExtensionResults(),
      response: { clientDataJSON: encode(assertion.clientDataJSON), authenticatorData: encode(assertion.authenticatorData),
        signature: encode(assertion.signature), userHandle: assertion.userHandle ? encode(assertion.userHandle) : null },
    },
  }));
}

export function clearLegacyAuth(storage: Pick<Storage, "removeItem"> = localStorage) {
  // Old sessions are deliberately not imported; users sign in again.
  for (const key of ["forena-kotlin-browser-auth", "forena-kotlin-browser-auth-code-verifier", "forena-kotlin-browser-auth-user"]) storage.removeItem(key);
}
