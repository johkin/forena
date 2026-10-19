import type { ParticipationFetch } from "../../src/components/activity-invitation-response";

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const reads = new RegExp(`^/api/activities/${uuid}/my-invitations$`, "i");
const writes = new RegExp(`^/api/invitations/${uuid}/respond$`, "i");

/** JWTs go only to the two same-origin Kotlin endpoints, never cookies or redirects. */
export function createApiFetch(readToken: () => Promise<string | null>, unauthorized: () => void, transport: typeof fetch = fetch): ParticipationFetch {
  return async (path, init = {}) => {
    const method = init.method ?? "GET";
    if (!((method === "GET" && reads.test(path)) || (method === "PUT" && writes.test(path)))) {
      throw new Error("Unsupported API request");
    }
    const token = await readToken();
    if (!token) { unauthorized(); return Response.json({ error: "Inloggning krävs." }, { status: 401 }); }
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (init.signal?.aborted) abort();
    init.signal?.addEventListener("abort", abort, { once: true });
    const deadline = setTimeout(abort, 10_000);
    try {
      const response = await transport(path, { ...init, method, headers, credentials: "omit", cache: "no-store", redirect: "error", signal: controller.signal });
      if (response.status === 401) unauthorized();
      return response;
    } finally {
      clearTimeout(deadline);
      init.signal?.removeEventListener("abort", abort);
    }
  };
}

export function safeDestination(value: string | null) {
  return value === "/" || value === "/components" || (value !== null && new RegExp(`^/activities/${uuid}$`, "i").test(value)) ? value! : "/";
}
