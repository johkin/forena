import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { components } from "../../backend/contract/generated";

const uuid = z.uuid();
const responseValue = z.enum(["pending", "accepted", "declined"]);
const change = z.object({ response: responseValue, comment: z.string().nullable().optional() }).strict();
const family = z.object({ invitations: z.array(z.object({
  id: uuid, person_id: uuid, response: responseValue, response_comment: z.string().nullable(), name: z.string(),
}).strict()) }).strict();
const committed = z.object({ ok: z.literal(true) }).strict();
type MyInvitations = components["schemas"]["MyInvitations"];
type ResponseChange = components["schemas"]["RespondToInvitationRequest"];
const targetAuthUrl = "https://ckzrtxqjskosqzoitymc.supabase.co";

/** Server environment only: requests, cookies and client flags cannot select a backend. */
export function kotlinParticipationSelected() {
  return process.env.FORENA_PARTICIPATION_BACKEND !== undefined
    && process.env.FORENA_PARTICIPATION_BACKEND !== "legacy";
}

function kotlinParticipationBaseUrl() {
  if (process.env.FORENA_PARTICIPATION_BACKEND !== "kotlin"
    || process.env.NEXT_PUBLIC_SUPABASE_URL !== targetAuthUrl) throw new Error("Invalid target configuration");
  const binding = process.env.FORENA_KOTLIN_SERVICE_URL;
  if (binding !== undefined) {
    // Vercel owns this server-only binding. It is a base URL, which can use
    // internal HTTP and a routing prefix; it is not a public HTTPS origin.
    const base = new URL(binding);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.hash) {
      throw new Error("Invalid service binding");
    }
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    return base;
  }
  return new URL(verifiedOrigin(process.env.FORENA_KOTLIN_API_URL ?? "") + "/");
}

function endpoint(base: URL, path: string) {
  // SECURITY: Prevent open redirect via /\example.com (handled by new URL())
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) throw new Error("Invalid API path");
  const url = new URL(path.slice(1), base);
  url.search = base.search;
  return url.href;
}

export function kotlinParticipationEndpoint(path: string) {
  return endpoint(kotlinParticipationBaseUrl(), path);
}

function verifiedOrigin(value: string) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/"
    || !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error("Invalid API origin");
  }
  return url.origin;
}

export function kotlinTestActivity() {
  kotlinParticipationBaseUrl();
  return uuid.parse(process.env.FORENA_KOTLIN_TEST_ACTIVITY_ID);
}

const messages: Record<number, string> = {
  400: "Ogiltigt kallelsesvar eller ID.", 401: "Logga in för att svara.",
  403: "Kallelsen är inte tillgänglig.", 404: "Aktiviteten kunde inte hittas.",
  409: "Kallelsen kan inte ändras just nu.", 503: "Kallelsetjänsten är tillfälligt otillgänglig. Försök igen.",
};
function failure(status: number) {
  return NextResponse.json({ error: messages[status] }, { status, headers: { "Cache-Control": "no-store" } });
}

/** One attempt, no redirect, no fallback, no cookies/admin key forwarded to Kotlin. */
export async function forwardKotlinParticipation(request: Request, kind: "list" | "respond", id: string) {
  try {
    const base = kotlinParticipationBaseUrl();
    if (!uuid.safeParse(id).success) return failure(400);
    // Next may construct an internal request URL behind a proxy. Compare against
    // the configured public site, never a caller-supplied forwarded-host header.
    const webOrigin = verifiedOrigin(process.env.SITE_URL ?? "");
    if (kind === "respond" && request.headers.has("origin")
      && request.headers.get("origin") !== webOrigin) return failure(403);
    const supabase = await createClient();
    // getSession only supplies the token. Identity is checked by Auth and again by Kotlin.
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) return failure(!authError.status || authError.status >= 500 || authError.status === 429 ? 503 : 401);
    if (!auth.user) return failure(401);
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token || data.session.user.id !== auth.user.id) return failure(401);
    let body: ResponseChange | undefined;
    if (kind === "respond") {
      const parsed = change.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return failure(400);
      body = parsed.data;
    }
    const path = kind === "list" ? `/api/activities/${id}/my-invitations` : `/api/invitations/${id}/respond`;
    const upstream = await fetch(endpoint(base, path), {
      method: kind === "list" ? "GET" : "PUT", cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (upstream.status !== 200) return failure(upstream.status in messages ? upstream.status : 503);
    const value: unknown = await upstream.json();
    if (kind === "list") {
      const parsed = family.safeParse(value);
      if (!parsed.success) return failure(503);
      const result: MyInvitations = parsed.data;
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    const parsed = committed.safeParse(value);
    return parsed.success ? NextResponse.json(parsed.data, { headers: { "Cache-Control": "no-store" } }) : failure(503);
  } catch {
    // Never return upstream bodies, exception messages or tokens to the browser.
    return failure(503);
  }
}
