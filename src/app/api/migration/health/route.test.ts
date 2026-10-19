import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { GET } from "./route";

beforeEach(() => {
  vi.stubEnv("FORENA_PARTICIPATION_BACKEND", "kotlin");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ckzrtxqjskosqzoitymc.supabase.co");
  vi.stubEnv("FORENA_KOTLIN_API_URL", "https://bound-api.test");
  vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "built-version");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "UP" })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

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
});
it("does not call Kotlin when the target configuration is disabled", async () => {
  vi.stubEnv("FORENA_PARTICIPATION_BACKEND", "legacy");
  expect((await GET()).status).toBe(503);
  expect(fetch).not.toHaveBeenCalled();
});
