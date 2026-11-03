import { beforeEach, expect, it, vi } from "vitest";

const load = vi.hoisted(() => vi.fn());
vi.mock("@/data/personal-dashboard", () => ({ getPersonalDashboard: load }));
import { GET } from "./route";

beforeEach(() => { load.mockReset(); });

it("requires the caller's session and prevents caching", async () => {
  load.mockResolvedValue(null);
  const response = await GET();
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

it("returns only navigation data for the caller's own and represented teams", async () => {
  const organization = { id: "club", name: "Klubben", slug: "klubben" };
  load.mockResolvedValue({
    accountEmail: "private@example.invalid", activities: [{ title: "Privat aktivitet" }],
    organizations: [organization],
    teams: [
      { organization, team: { id: "own", name: "Mitt lag", slug: "mitt-lag" }, roles: ["Ledare"] },
      { organization, team: { id: "child", name: "Barnets lag", slug: "barnets-lag" }, roles: ["Målsman"] },
    ],
  });
  const response = await GET();
  const data = await response.json();
  expect(response.status).toBe(200);
  expect(data.teams).toHaveLength(2);
  expect(data.teams[1]).toEqual({ id: "child", organizationId: "club", name: "Barnets lag", roles: ["Målsman"], href: "/o/klubben/t/barnets-lag" });
  expect(data).not.toHaveProperty("activities");
  expect(data).not.toHaveProperty("accountEmail");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

it("reports a read failure without publishing an empty list or internal errors", async () => {
  load.mockRejectedValue(new Error("private database detail"));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "Dina lag kunde inte hämtas." });
});
