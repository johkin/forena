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
const render = (readOnly = false) => elements(ActivityDutySchedule({ activityId: "activity", startsAt: "2030-10-10T06:00:00Z", endsAt: "2030-10-10T16:00:00Z", timeZone: "Europe/Stockholm", readOnly }));
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

it("keeps past work visible without management controls even if editing state was set", () => {
  hooks.values[5] = true;
  const tree = render(true);
  expect(tree.some(el => el.type === DutyEditor || el.type === "input")).toBe(false);
  expect(tree.filter(el => el.type === "h4")).toHaveLength(3);
  expect(tree.filter(el => el.type === "button").map(el => el.props.children)).toEqual(["Hämta senaste schemat"]);
});

it("clears previous success and errors when proposing a new change", () => {
  hooks.values[4] = "Ändringen är sparad i schemat.";
  hooks.values[1] = "Ett gammalt fel";
  hooks.values[5] = true; hooks.values[6] = [schedule.duties[0].id];
  const button = render().find(el => el.type === "button" && el.props.className === "danger");
  (button!.props.onClick as () => void)();
  expect(hooks.setters[4]).toHaveBeenCalledWith("");
  expect(hooks.setters[1]).toHaveBeenCalledWith("");
});
it("keeps a rejected preview open and clears stale success when saving fails", async () => {
  const preview = { command: { op: "assign_batch", assignments: [{ slotId: "slot1", personId: "person", revision: 1 }] }, text: "Tilldela 1 plats", rows: [] };
  hooks.values[7] = preview; hooks.values[4] = "Senaste schemat har hämtats.";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Schemat har ändrats" }), { status: 409 })));
  try {
    const button = render().find(el => el.type === "button" && el.props.children === "Bekräfta");
    (button!.props.onClick as () => void)();
    await vi.waitFor(() => expect(hooks.setters[1]).toHaveBeenCalledWith("Schemat har ändrats"));
    expect(hooks.setters[4]).toHaveBeenCalledExactlyOnceWith("");
    expect(hooks.setters[7]).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: "POST", body: JSON.stringify(preview.command) }));
  } finally { vi.unstubAllGlobals(); }
});
it("only reports saved after a successful response and closes the preview", async () => {
  hooks.values[7] = { command: { op: "assign_batch", assignments: [] }, text: "Tilldela", rows: [] };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(schedule))));
  try {
    const button = render().find(el => el.type === "button" && el.props.children === "Bekräfta");
    (button!.props.onClick as () => void)();
    await vi.waitFor(() => expect(hooks.setters[4]).toHaveBeenLastCalledWith("Ändringen är sparad i schemat."));
    expect(hooks.setters[7]).toHaveBeenCalledWith(null);
    expect(hooks.setters[0]).toHaveBeenCalledWith(schedule);
  } finally { vi.unstubAllGlobals(); }
});
