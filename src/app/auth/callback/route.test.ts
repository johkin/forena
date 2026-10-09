import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";

const exchange = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { exchangeCodeForSession: exchange }, rpc: async () => ({ error: null }),
}) }));
beforeEach(() => exchange.mockResolvedValue({ error: null }));
it("returns to the team that initiated login", async () => {
  const next = "/o/ursvik-ik/t/f2016";
  const result = await GET(new Request(`https://forena.test/auth/callback?code=test&next=${encodeURIComponent(next)}`));
  expect(result.headers.get("location")).toBe(`https://forena.test${next}`);
});
it("uses the personal home when login has no destination", async () => {
  const result = await GET(new Request("https://forena.test/auth/callback?code=test"));
  expect(result.headers.get("location")).toBe("https://forena.test/");
});
