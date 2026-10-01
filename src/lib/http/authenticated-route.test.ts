import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getClaims: vi.fn() }));
vi.mock("../supabase/server", () => ({ createClient: mocks.createClient }));
import { withAuthenticatedRoute } from "./authenticated-route";

describe("withAuthenticatedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: { getClaims: mocks.getClaims } });
  });

  it.each([
    { data: null, error: null },
    { data: { claims: { sub: "user" } }, error: new Error("Invalid token") },
    { data: { claims: {} }, error: null },
    { data: { claims: { sub: "" } }, error: null },
  ])("blocks missing or invalid verified claims", async claims => {
    mocks.getClaims.mockResolvedValue(claims);
    const handler = vi.fn();
    const response = await withAuthenticatedRoute(handler)(new Request("https://example.test/api"));
    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes the verified identity and request-scoped client to the handler", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "verified-user" } }, error: null });
    const expected = new Response("ok");
    const handler = vi.fn().mockResolvedValue(expected);
    const request = new Request("https://example.test/api", { headers: { "x-user-id": "forged-user" } });
    expect(await withAuthenticatedRoute(handler)(request)).toBe(expected);
    expect(handler).toHaveBeenCalledWith(request, {
      userId: "verified-user", supabase: await mocks.createClient.mock.results[0].value,
    });
  });
});
