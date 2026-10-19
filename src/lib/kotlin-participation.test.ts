import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getUser: vi.fn(), getSession: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
import { GET } from "@/app/api/activities/[activityId]/my-invitations/route";
import { PUT } from "@/app/api/invitations/[invitationId]/respond/route";
import { kotlinParticipationSelected } from "./kotlin-participation";

const id = "8d346830-5261-466c-aa58-769c83032376";
const person = "0bc56f4f-dfea-4f6c-b03e-15553ecf859a";
const row = { id, person_id: person, response: "accepted", response_comment: null, name: "Syntetiskt barn" };
const list = () => GET(new Request("https://web.test/api/activities/" + id), { params: Promise.resolve({ activityId: id }) });
const respond = (body: unknown, origin = "https://web.test") => PUT(new Request("https://web.test/api/invitations/" + id, {
  method: "PUT", headers: { Origin: origin, Authorization: "Bearer caller-token", Cookie: "untrusted=cookie" }, body: JSON.stringify(body),
}), { params: Promise.resolve({ invitationId: id }) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FORENA_PARTICIPATION_BACKEND", "kotlin");
  vi.stubEnv("FORENA_KOTLIN_API_URL", "https://api.test");
  vi.stubEnv("FORENA_KOTLIN_SERVICE_URL", undefined);
  vi.stubEnv("SITE_URL", "https://web.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ckzrtxqjskosqzoitymc.supabase.co");
  mocks.getUser.mockResolvedValue({ data: { user: { id: "subject" } }, error: null });
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: "verified-session-token", user: { id: "subject" } } }, error: null });
  mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser, getSession: mocks.getSession }, from: mocks.from });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ invitations: [row] })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("uses the generated contract shape and forwards only the verified session token", async () => {
  const result = await list();
  expect(await result.json()).toEqual({ invitations: [row] });
  expect(result.headers.get("cache-control")).toBe("no-store");
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  expect(url).toBe(`https://api.test/api/activities/${id}/my-invitations`);
  expect(options).toMatchObject({ cache: "no-store", redirect: "error", headers: { Authorization: "Bearer verified-session-token" } });
  expect(options?.headers).not.toHaveProperty("Cookie");
  expect(mocks.from).not.toHaveBeenCalled();
});
it.each([{ response: "accepted" }, { response: "declined", comment: null }, { response: "accepted", comment: "  😀  " }, { response: "pending" }])("preserves omission/null and lets Kotlin normalize comments: %j", async body => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ ok: true }));
  expect((await respond(body)).status).toBe(200);
  expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toEqual(body);
});
it.each([400, 401, 403, 404, 409, 503])("keeps upstream status %i without returning upstream text", async status => {
  vi.mocked(fetch).mockResolvedValue(new Response("private provider details", { status }));
  const result = await list();
  expect(result.status).toBe(status);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(await result.text()).not.toContain("private provider details");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(mocks.from).not.toHaveBeenCalled();
});
it.each(["timeout", "redirect"])('fails closed after %s without retry or legacy fallback', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("secret upstream detail"));
  expect((await respond({ response: "accepted" })).status).toBe(503);
  expect(fetch).toHaveBeenCalledTimes(1); expect(mocks.from).not.toHaveBeenCalled();
});
it.each([{}, { ok: false }, { invitations: [{ ...row, response: "unknown" }] }])("rejects an incompatible success body: %j", async body => {
  vi.mocked(fetch).mockResolvedValue(Response.json(body));
  expect((await list()).status).toBe(503);
});
it.each([{ response: "yes" }, { response: "accepted", comment: 42 }, { response: "accepted", subject: "other" }])("rejects unsupported request bodies: %j", async body => {
  expect((await respond(body)).status).toBe(400); expect(fetch).not.toHaveBeenCalled();
});
it("requires current Auth status and a matching session user", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect((await list()).status).toBe(401); expect(mocks.getSession).not.toHaveBeenCalled();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "other" } }, error: null });
  expect((await list()).status).toBe(401); expect(fetch).not.toHaveBeenCalled();
});
it("distinguishes an Auth outage from an inactive user", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 503 } });
  expect((await list()).status).toBe(503); expect(fetch).not.toHaveBeenCalled();
});
it("uses the configured browser origin behind Next's internal request URL", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ ok: true }));
  const request = new Request("http://internal:3000/api/invitations/" + id, { method: "PUT", headers: { Origin: "https://web.test" }, body: JSON.stringify({ response: "accepted" }) });
  expect((await PUT(request, { params: Promise.resolve({ invitationId: id }) })).status).toBe(200);
});
it.each(["http://remote.test", "https://u:p@api.test", "https://api.test/path", "https://api.test?key=x"])('rejects unsafe origin %s before reading a session', async origin => {
  vi.stubEnv("FORENA_KOTLIN_API_URL", origin);
  expect((await list()).status).toBe(503); expect(mocks.createClient).not.toHaveBeenCalled();
});
it("rejects the legacy Auth project and cross-origin writes", async () => {
  expect((await respond({ response: "accepted" }, "https://attacker.test")).status).toBe(403);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://old-project.supabase.co");
  expect((await list()).status).toBe(503); expect(fetch).not.toHaveBeenCalled();
});
it("keeps legacy as the default and fails closed on misspelled selections", async () => {
  vi.stubEnv("FORENA_PARTICIPATION_BACKEND", undefined); expect(kotlinParticipationSelected()).toBe(false);
  vi.stubEnv("FORENA_PARTICIPATION_BACKEND", "legacy"); expect(kotlinParticipationSelected()).toBe(false);
  vi.stubEnv("FORENA_PARTICIPATION_BACKEND", "kotln"); expect((await list()).status).toBe(503); expect(mocks.from).not.toHaveBeenCalled();
});

it.each([
  ["http://backend.internal", "http://backend.internal"],
  ["http://backend.internal/service/backend", "http://backend.internal/service/backend"],
  ["https://binding.test/private/backend/", "https://binding.test/private/backend"],
])("uses the server-owned service binding and preserves its routing prefix: %s", async (binding, prefix) => {
  vi.stubEnv("FORENA_KOTLIN_SERVICE_URL", binding);
  vi.stubEnv("FORENA_KOTLIN_API_URL", "https://unused-public-api.test");
  expect((await list()).status).toBe(200);
  expect(vi.mocked(fetch).mock.calls[0][0]).toBe(`${prefix}/api/activities/${id}/my-invitations`);
  vi.mocked(fetch).mockResolvedValue(Response.json({ ok: true }));
  expect((await respond({ response: "accepted" })).status).toBe(200);
  expect(vi.mocked(fetch).mock.calls[1][0]).toBe(`${prefix}/api/invitations/${id}/respond`);
});
it("preserves a binding query without exposing it to the browser", async () => {
  vi.stubEnv("FORENA_KOTLIN_SERVICE_URL", "https://binding.test/backend/?routing=synthetic-private-marker");
  const result = await list();
  expect(vi.mocked(fetch).mock.calls[0][0]).toBe(`https://binding.test/backend/api/activities/${id}/my-invitations?routing=synthetic-private-marker`);
  expect(await result.text()).not.toContain("synthetic-private-marker");
});
it.each(["", "ftp://binding.test/", "https://user:secret@binding.test/", "https://binding.test/#fragment"])("fails closed on invalid service binding %s without public fallback", async binding => {
  vi.stubEnv("FORENA_KOTLIN_SERVICE_URL", binding);
  expect((await list()).status).toBe(503);
  expect(mocks.createClient).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
