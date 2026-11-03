import { expect, it, vi } from "vitest";
import { loadMyTeams } from "./my-teams";

const club = "11111111-1111-4111-8111-111111111111";
const team = "22222222-2222-4222-8222-222222222222";

it("uses the authenticated overview and preserves represented teams and roles", async () => {
  const request = vi.fn(async () => Response.json({
    organizations: [{ id: club, name: "Klubben" }],
    teams: [{ id: team, organization_id: club, name: "Barnets lag", roles: ["guardian"] }],
    activities: [{ title: "Privat aktivitet" }],
  }));
  const signal = new AbortController().signal;
  const data = await loadMyTeams(request, signal);
  expect(request).toHaveBeenCalledWith("/api/me/overview", { signal });
  expect(data.teams).toEqual([{ id: team, organizationId: club, name: "Barnets lag", roles: ["Målsman"], href: `/teams/${team}` }]);
  expect(data).not.toHaveProperty("activities");
});

it("rejects unavailable or malformed overview data instead of showing no teams", async () => {
  const signal = new AbortController().signal;
  await expect(loadMyTeams(async () => new Response(null, { status: 503 }), signal)).rejects.toThrow();
  await expect(loadMyTeams(async () => Response.json({ organizations: [], teams: [{ id: "bad" }] }), signal)).rejects.toThrow();
});
