import type { ParticipationFetch } from "../../src/components/activity-invitation-response";

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const reads = new RegExp(`^/api/activities/${uuid}(?:/my-invitations)?$`, "i");
const editorReads = new RegExp(`^/api/teams/${uuid}/activity-editor$`, "i");
const rosterReads = new RegExp(`^/api/teams/${uuid}/roster(?:/access)?$`, "i");
const rosterMembers = new RegExp(`^/api/teams/${uuid}/roster/members/${uuid}$`, "i");
const rosterGroups = new RegExp(`^/api/teams/${uuid}/roster/groups$`, "i");
const rosterGroup = new RegExp(`^/api/teams/${uuid}/roster/groups/${uuid}$`, "i");
const rosterDeletion = new RegExp(`^/api/teams/${uuid}/roster/groups/${uuid}\\?revision=\\d{1,16}$`, "i");
const activityWrites = new RegExp(`^/api/activities/${uuid}$`, "i");
const adminResource = new RegExp(`^/api/admin/(?:bootstrap|platform-administrators|clubs|(?:clubs|sections|teams)/${uuid}(?:/(?:administrators|sections|teams)(?:/${uuid})?)?)$`, "i");
const adminSlug = new RegExp(`^/api/admin/slug\\?slug=[a-z0-9-]{1,120}(?:&organizationId=${uuid})?$`, "i");
const systemDestination = new RegExp(`^/system/(?:organizations(?:/${uuid})?|administrators|disciplines|activity-types|memories)$`, "i");
const clubAdministrationDestination = new RegExp(`^/organizations/${uuid}/(?:administration|sections/${uuid}/teams)$`, "i");
const writes = new RegExp(`^/api/invitations/${uuid}/respond$`, "i");

/** Only allowlisted, same-origin API calls receive the HttpOnly session cookie. */
export function createApiFetch(readAccount: () => Promise<string | null>, unauthorized: () => void, transport: typeof fetch = fetch): ParticipationFetch {
  return async (path, init = {}) => {
    const method = init.method ?? "GET";
    const allowedRead = method === "GET" && (
      path === "/api/admin/overview" || adminSlug.test(path) || reads.test(path) || editorReads.test(path) || rosterReads.test(path) || path === "/api/me/managed-teams" ||
      path === "/api/me/overview" || /^\/api\/me\/activities(?:\?offset=\d{1,6})?$/.test(path)
    );
    const allowedWrite = (["POST", "PUT", "DELETE"].includes(method) && adminResource.test(path)) || (method === "PUT" && writes.test(path)) ||
      (method === "POST" && (path === "/api/activities" || path === "/api/activity-series")) ||
      (["PUT", "DELETE"].includes(method) && activityWrites.test(path)) ||
      (method === "PUT" && (rosterMembers.test(path) || rosterGroup.test(path))) ||
      (method === "POST" && rosterGroups.test(path)) || (method === "DELETE" && rosterDeletion.test(path));
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
  if (value === null) return "/";
  const knownRoute = ["/", "/activities/manage", "/administration", "/system", "/components", "/notifications"].includes(value);
  const workspace = new RegExp(`^/(?:activities|organizations|teams)/${uuid}$`, "i").test(value);
  const roster = new RegExp(`^/teams/${uuid}/members$`, "i").test(value);
  return knownRoute || workspace || roster || systemDestination.test(value) || clubAdministrationDestination.test(value) ? value : "/";
}

/** OAuth resumes through the server, preserving the query without allowing arbitrary redirects. */
export function oauthDestination(value: string | null): string | undefined {
  return value !== null && /^\/oauth2\/authorize\?[^\s\\#]+$/.test(value) ? value : undefined;
}
