import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/data/personal-dashboard", () => ({ getPersonalDashboard: state.load }));
import { GET } from "./route";
beforeEach(() => { state.load.mockReset(); });
it("validates the month before reading data and requires a session", async () => {
  expect((await GET(new Request("http://localhost/api/me/calendar?month=2026-13"))).status).toBe(400);
  expect(state.load).not.toHaveBeenCalled();
  state.load.mockResolvedValue(null);
  expect((await GET(new Request("http://localhost/api/me/calendar?month=2026-10"))).status).toBe(401);
});
it("fails explicitly instead of publishing an empty calendar on a read failure", async () => {
  state.load.mockImplementation(async () => { throw new Error("database unavailable"); });
  const response = await GET(new Request("http://localhost/api/me/calendar?month=2026-10"));
  expect(response.status).toBe(503);
  expect(await response.json()).not.toHaveProperty("activities");
});
it("loads only the requested month, returning deduplicated activities and a private snapshot", async () => {
  const activity = { id: "a", title: "Träning" };
  state.load.mockResolvedValue({ accountId: "account", calendarScope: { people: [], teams: [] }, activities: [{ activity }, { activity }] });
  const response = await GET(new Request("http://localhost/api/me/calendar?month=2026-10"));
  expect(state.load).toHaveBeenCalledWith("2026-10");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect((await response.json()).activities).toEqual([activity]);
});
