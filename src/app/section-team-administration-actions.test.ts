import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc, auth: { getUser: mocks.getUser } }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { saveSectionTeam, deleteSectionTeam } from "./section-team-administration-actions";
const club = "10000000-0000-0000-0000-000000000001";
const section = "20000000-0000-0000-0000-000000000001";
const team = "30000000-0000-0000-0000-000000000001";
const structure = { organization: { id: club, slug: "uik", name: "UIK", assistantName: "A", timeZone: "Europe/Stockholm" }, section: { id: section, slug: "fotboll", name: "Fotboll", disciplineName: "Fotboll" }, teams: [{ id: team, name: "F2016", slug: "f2016", season: "2026", canDelete: false }] };
function form(extra: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ organizationId: club, sectionId: section, name: " F2015 ", season: "2027", ...extra })) data.set(key, value);
  return data;
}
beforeEach(() => { vi.clearAllMocks(); mocks.getUser.mockResolvedValue({ data: { user: { id: "user" } }, error: null }); mocks.rpc.mockImplementation(async (name: string) => name === "section_team_structure" ? { data: structure, error: null } : { data: team, error: null }); });
it("keeps the server's existing address and invalidates overview and system administration", async () => {
  await expect(saveSectionTeam(form({ teamId: team, slug: "forged-address" }))).rejects.toThrow("?saved=1");
  expect(mocks.rpc).toHaveBeenCalledWith("save_section_team", { target: club, section_id: section, team_id: team, input: { name: "F2015", slug: "f2016", season: "2027" } });
  expect(mocks.revalidate).toHaveBeenCalledWith("/o/uik", "layout");
  expect(mocks.revalidate).toHaveBeenCalledWith(`/system/organizations/${club}`);
});
it("creates a normalized new address in the checked section", async () => {
  await expect(saveSectionTeam(form({ name: "Flickor Åtta" }))).rejects.toThrow("?created=1");
  expect(mocks.rpc).toHaveBeenCalledWith("save_section_team", expect.objectContaining({ section_id: section, team_id: null, input: { name: "Flickor Åtta", slug: "flickor-atta", season: "2027" } }));
});
it("does not save a team outside the returned section", async () => {
  await expect(saveSectionTeam(form({ teamId: "30000000-0000-0000-0000-000000000099" }))).rejects.toThrow("?error=");
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it("requires authentication before administrative reads", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  await expect(saveSectionTeam(form())).rejects.toThrow("redirect:/login");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("surfaces a deletion blocked by saved data without reporting success", async () => {
  mocks.rpc.mockImplementation(async (name: string) => name === "section_team_structure" ? { data: structure } : { error: { code: "55000", message: "Team is in use" } });
  await expect(deleteSectionTeam(form({ teamId: team }))).rejects.toThrow("?error=");
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("rejects invalid identifiers before RPC calls", async () => {
  await expect(saveSectionTeam(form({ sectionId: "bad" }))).rejects.toThrow("?error=");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
