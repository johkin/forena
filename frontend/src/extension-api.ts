const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const id = "[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}";
const activity = new RegExp(`^/api/activities/${id}/follow-up$`, "i");
const capability = new RegExp(`^/api/teams/${id}/capabilities$`, "i");
const teamRead = new RegExp(`^/api/teams/${id}/(?:signals|follow-up|discipline-players)$`, "i");
const report = new RegExp(`^/api/teams/${id}/information-report$`, "i");
const action = new RegExp(`^/api/signals/${id}/actions$`, "i");
const catalogue = /^\/api\/discipline-catalogue\/(?:disciplines|categories)\/[a-z][a-z0-9_-]{0,63}$/;
const scopes = new Set(["team", "teamMembership", "activity", "activityParticipation"]);

/** Narrow extension routes share the existing account-bound transport and session checks. */
export function extensionRequestAllowed(path: string, method: string): boolean {
  if (path.length > 4096 || path.includes("#")) return false;
  const [resource, query, extra] = path.split("?");
  if (extra !== undefined) return false;
  const params = new URLSearchParams(query);
  if ([...params.keys()].some(key => params.getAll(key).length !== 1)) return false;
  const only = (keys: string[]) => [...params.keys()].every(key => keys.includes(key));
  const hasId = (key: string) => uuid.test(params.get(key) ?? "");
  const absent = params.size === 0;
  if (method === "GET") {
    if (absent && (["/api/disciplines", "/api/discipline-catalogue"].includes(resource)
      || activity.test(resource) || capability.test(resource) || teamRead.test(resource))) return true;
    if (resource === "/api/discipline-fields") return only(["scope", "teamId", "activityId", "personId"])
      && hasId("teamId") && scopes.has(params.get("scope") ?? "")
      && ["activityId", "personId"].every(key => !params.has(key) || hasId(key));
    if (resource === "/api/activity-defaults") return only(["scope", "scopeId"])
      && ["section", "team"].includes(params.get("scope") ?? "") && hasId("scopeId");
    if (report.test(resource)) return only(["fromDate", "untilDate", "season"])
      && ["fromDate", "untilDate"].every(key => !params.has(key) || /^\d{4}-\d{2}-\d{2}$/.test(params.get(key) ?? ""))
      && (!params.has("season") || /^\d{4}$/.test(params.get("season") ?? ""));
  }
  if (!absent) return false;
  if (method === "PUT") return ["/api/discipline-fields", "/api/activity-defaults"].includes(resource)
    || activity.test(resource) || capability.test(resource) || catalogue.test(resource);
  if (method === "DELETE") return catalogue.test(resource);
  return method === "POST" && action.test(resource);
}
