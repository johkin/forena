import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { GET } from "./route";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("FORENA_PARTICIPATION_BACKEND", "kotlin");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ckzrtxqjskosqzoitymc.supabase.co");
  vi.stubEnv("FORENA_KOTLIN_API_URL", "https://bound-api.test");
  vi.stubEnv("FORENA_KOTLIN_SERVICE_URL", undefined);
  vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "built-version");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "UP" })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("checks the bound API and returns the exact frontend build version without credentials", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok", version: "built-version" });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(fetch).toHaveBeenCalledWith("https://bound-api.test/actuator/health", expect.objectContaining({
    cache: "no-store", redirect: "error",
  }));
  expect(vi.mocked(fetch).mock.calls[0][1]).not.toHaveProperty("headers");
});
it.each([{ status: "DOWN", details: "private database error" }, { status: "ok" }, {}])("fails closed for an unhealthy or incompatible API: %j", async body => {
  vi.mocked(fetch).mockResolvedValue(Response.json(body));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "unavailable" });
});
it("does not reveal upstream exception messages or retry", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("private hostname and password"));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ status: "unavailable" });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(console.error).toHaveBeenCalledWith("migration_health_failed", { stage: "upstream" });
});
it("does not call Kotlin when the target configuration is disabled", async () => {
  vi.stubEnv("FORENA_PARTICIPATION_BACKEND", "legacy");
  expect((await GET()).status).toBe(503);
  expect(fetch).not.toHaveBeenCalled();
  expect(console.error).toHaveBeenCalledWith("migration_health_failed", { stage: "configuration" });
});
it("checks health through an internal binding prefix", async () => {
  vi.stubEnv("FORENA_KOTLIN_SERVICE_URL", "http://backend.internal/private/backend/");
  expect((await GET()).status).toBe(200);
  expect(fetch).toHaveBeenCalledWith("http://backend.internal/private/backend/actuator/health", expect.anything());
});
it("logs only the failed HTTP stage and status, without reading an upstream error body", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("private password and hostname", { status: 503 }));
  const result = await GET();
  expect(await result.json()).toEqual({ status: "unavailable" });
  expect(console.error).toHaveBeenCalledExactlyOnceWith("migration_health_failed", { stage: "response", status: 503 });
});
