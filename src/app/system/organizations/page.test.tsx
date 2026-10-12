import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/app/club-administration-actions", () => ({ createManagedClub: vi.fn() }));
vi.mock("@/components/club-onboarding", () => ({ ClubOnboarding: () => null }));
import ClubsPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: { clubs: [{ id: "10000000-0000-0000-0000-000000000001", name: "AIK", slug: "aik" }], total: 31 }, error: null });
  const catalogue = { select: vi.fn(), order: vi.fn().mockResolvedValue({ data: [], error: null }) };
  catalogue.select.mockReturnValue(catalogue);
  mocks.from.mockReturnValue(catalogue);
  mocks.client.mockResolvedValue({ rpc: mocks.rpc, from: mocks.from });
});
it("renders clubs from the authorized system command rather than membership-filtered table reads", async () => {
  const html = renderToStaticMarkup(await ClubsPage({ searchParams: Promise.resolve({}) }));
  expect(mocks.rpc).toHaveBeenCalledWith("system_clubs", { search_query: "", page_number: 1 });
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith("disciplines");
  expect(html).toContain("AIK");
  expect(html).toContain("/o/aik");
  expect(html).toContain("Nästa");
});
it("passes trimmed search and page through to the command and pagination links", async () => {
  const html = renderToStaticMarkup(await ClubsPage({ searchParams: Promise.resolve({ q: "  AIK  ", page: "2" }) }));
  expect(mocks.rpc).toHaveBeenCalledWith("system_clubs", { search_query: "AIK", page_number: 2 });
  expect(html).toContain("Föregående");
  expect(html).toContain("page=1&amp;q=AIK");
  expect(html).not.toContain("Nästa");
});
it("reports a failed listing instead of displaying a misleading empty club list", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
  await expect(ClubsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("Klubbarna kunde inte hämtas.");
});
