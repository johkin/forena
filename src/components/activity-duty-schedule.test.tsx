import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { DutySchedule } from "@/lib/activity-duty-schedule";
const hooks = vi.hoisted(() => ({ index: 0, values: [] as unknown[], setters: [] as ReturnType<typeof vi.fn>[] }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => { const i = hooks.index++; return [i in hooks.values ? hooks.values[i] : initial, hooks.setters[i] ?? (hooks.setters[i] = vi.fn())]; },
  useEffect: () => {}, useRef: (value: unknown) => ({ current: value }),
}));
import { ActivityDutySchedule } from "./activity-duty-schedule";
import { DutyEditor } from "./duty-management";
function elements(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as ReactElement<Record<string, unknown>>;
  return [el, ...elements(el.props.children)];
}
const schedule: DutySchedule = { isWork: true, canManage: true, types: [], people: [], requests: [],
  claimRequiresApproval: false, changeRequiresApproval: false, selfServiceUntil: "2030-10-10T06:00:00Z",
  duties: [1, 2, 3].map(i => ({ id: `a0000000-0000-4000-8000-${String(i).padStart(12, "0")}`, dutyTypeId: "type", revision: i,
    name: "Café", timingKind: "interval", startsAt: "2030-10-10T06:00:00Z", endsAt: "2030-10-10T08:00:00Z", dueAt: null, instructions: "",
    slots: [{ id: `slot${i}`, revision: 1, personId: "person", personName: "Spelare", occupied: true, mine: false, completedAt: i === 3 ? "2030-10-10T08:00:00Z" : null }],
  })),
};
const render = () => elements(ActivityDutySchedule({ activityId: "activity", startsAt: "2030-10-10T06:00:00Z", endsAt: "2030-10-10T16:00:00Z", timeZone: "Europe/Stockholm" }));
beforeEach(() => { hooks.index = 0; hooks.setters = []; hooks.values = [schedule, "", false, false, "", false, [], null]; });
it("opens in viewing mode and requires explicit duty editing", () => {
  const tree = render();
  expect(tree.some(el => el.type === DutyEditor)).toBe(false);
  const button = tree.find(el => el.type === "button" && el.props.children === "Redigera arbetsuppgifter");
  expect(button).toBeDefined();
  (button!.props.onClick as () => void)();
  expect(hooks.setters[5]).toHaveBeenCalled();
});
it("selects all removable duties while protecting completed work", () => {
  hooks.values[5] = true;
  const tree = render();
  const button = tree.find(el => el.type === "button" && el.props.children === "Markera alla");
  (button!.props.onClick as () => void)();
  expect(hooks.setters[6]).toHaveBeenCalledWith(schedule.duties.slice(0, 2).map(d => d.id));
  const checkboxes = tree.filter(el => el.type === "input" && el.props.type === "checkbox");
  expect(checkboxes.map(el => el.props.disabled)).toEqual([false, false, true]);
});
it("previews one versioned cancellation command with affected bookings", () => {
  hooks.values[5] = true; hooks.values[6] = schedule.duties.slice(0, 2).map(d => d.id);
  const tree = render();
  const button = tree.find(el => el.type === "button" && el.props.className === "danger");
  (button!.props.onClick as () => void)();
  expect(hooks.setters[7]).toHaveBeenCalledWith(expect.objectContaining({
    command: { op: "cancel_duties", duties: schedule.duties.slice(0, 2).map(d => ({ dutyId: d.id, revision: d.revision })) },
    rows: [expect.stringContaining("1 bokade platser frigörs"), expect.stringContaining("1 bokade platser frigörs")],
  }));
});
it("does not expose duty editing to a family", () => {
  hooks.values[0] = { ...schedule, canManage: false }; hooks.values[5] = true;
  expect(render().some(el => el.type === DutyEditor || el.props.children === "Avsluta redigering")).toBe(false);
});
