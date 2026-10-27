import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { CalendarScope } from "../lib/personal-calendar";
import { CalendarFiltersView, useCalendarFilters } from "./calendar-filters";

vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => [initial, () => {}],
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));
afterEach(() => { vi.unstubAllGlobals(); });

it("offers person selection only with a child relationship and multiple available people", () => {
  const own = { id: "own", displayName: "Alex", isSelf: true, teamIds: ["team"] };
  const child = { id: "child", displayName: "Kim", isSelf: false, teamIds: ["team"] };
  for (const [people, visible] of [[[], false], [[own], false], [[child], false], [[own, child], true]] as const) {
    const scope: CalendarScope = { people: [...people], teams: [{ id: "team", name: "Laget" }] };
    const html = renderToStaticMarkup(<CalendarFiltersView scope={scope} teams={scope.teams} value={{ people: null, teams: null }} onChange={() => {}} />);
    expect(html.includes('aria-label="Filtrera på person"')).toBe(visible);
    expect(html).not.toContain('aria-label="Filtrera på lag"');
  }
});

it("isolates remembered filters by account and by device", () => {
  const deviceOne = new Map<string, string>();
  const deviceTwo = new Map<string, string>();
  let device = deviceOne;
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => device.get(key) ?? null, setItem: (key: string, value: string) => device.set(key, value) }, dispatchEvent: vi.fn() });
  const first = { people: ["child-one"], teams: ["team-one"] };
  useCalendarFilters("account-one")[1](first);
  expect(useCalendarFilters("account-two")[0]).toEqual({ people: null, teams: null });
  useCalendarFilters("account-two")[1]({ people: ["child-two"], teams: null });
  expect(useCalendarFilters("account-one")[0]).toMatchObject(first);
  device = deviceTwo;
  expect(useCalendarFilters("account-one")[0]).toEqual({ people: null, teams: null });
  useCalendarFilters("account-one")[1]({ people: ["self"], teams: null });
  device = deviceOne;
  expect(useCalendarFilters("account-one")[0]).toMatchObject(first);
});
