import type { ParticipationFetch } from "../../src/components/activity-invitation-response";

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const reads = new RegExp(`^/api/activities/${uuid}(?:/my-invitations)?$`, "i");
const editorReads = new RegExp(`^/api/teams/${uuid}/activity-editor$`, "i");
const activityWrites = new RegExp(`^/api/activities/${uuid}$`, "i");
const adminResource = new RegExp(`^/api/admin/(?:bootstrap|platform-administrators|clubs|(?:clubs|sections|teams)/${uuid}(?:/(?:administrators|sections|teams)(?:/${uuid})?)?)$`, "i");
const adminSlug = new RegExp(`^/api/admin/slug\\?slug=[a-z0-9-]{1,120}(?:&organizationId=${uuid})?$`, "i");
const writes = new RegExp(`^/api/invitations/${uuid}/respond$`, "i");

/** Only allowlisted, same-origin API calls receive the HttpOnly session cookie. */
export function createApiFetch(readAccount: () => Promise<string | null>, unauthorized: () => void, transport: typeof fetch = fetch): ParticipationFetch {
  return async (path, init = {}) => {
    const method = init.method ?? "GET";
    const allowedRead = method === "GET" && (
      path === "/api/admin/overview" || adminSlug.test(path) || reads.test(path) || editorReads.test(path) || path === "/api/me/managed-teams" ||
      path === "/api/me/overview" || /^\/api\/me\/activities(?:\?offset=\d{1,6})?$/.test(path)
    );
    const allowedWrite = (["POST", "PUT", "DELETE"].includes(method) && adminResource.test(path)) || (method === "PUT" && writes.test(path)) ||
      (method === "POST" && path === "/api/activities") ||
      (["PUT", "DELETE"].includes(method) && activityWrites.test(path));
    if (!allowedRead && !allowedWrite) throw new Error("Unsupported API request");
    const account = await readAccount();
    if (!account) { unauthorized(); return Response.json({ error: "Inloggning krävs." }, { status: 401 }); }
    const headers = new Headers(init.headers);
    headers.delete("Authorization");
    // Prevent an old view from applying a write under a different account after a cross-tab login.
    headers.set("X-Forena-Account", account);
    if (method !== "GET") headers.set("X-Forena-Request", "1");
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (init.signal?.aborted) abort();
    init.signal?.addEventListener("abort", abort, { once: true });
    const deadline = setTimeout(abort, 10_000);
    try {
      const response = await transport(path, { ...init, method, headers, credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal });
      // A platform login page must not revoke a valid app session. Only
      // Kotlin's explicit application response means the app session is invalid.
      if (response.status === 401 && response.headers.get("content-type")?.includes("application/json")) {
        const body = await response.clone().json().catch(() => null);
        if (body?.error === "Inloggning krävs." || body?.error === "Sessionen är inte aktiv.") unauthorized();
      }
      return response;
    } finally {
      clearTimeout(deadline);
      init.signal?.removeEventListener("abort", abort);
    }
  };
}

export function safeDestination(value: string | null) {
  return value === "/" || value === "/activities/manage" || value === "/administration" || value === "/components" || value === "/notifications" || (value !== null && new RegExp(`^/(?:activities|organizations|teams)/${uuid}$`, "i").test(value)) ? value! : "/";
}

/** OAuth resumes through the server, preserving the query without allowing arbitrary redirects. */
export function oauthDestination(value: string | null): string | undefined {
  return value !== null && /^\/oauth2\/authorize\?[^\s\\#]+$/.test(value) ? value : undefined;
}
