import { expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { dutySeriesDefinitionSchema, type Duty, type DutySeries } from "@/lib/activity-duty-schedule";
import { DutySeriesEditor, DutySeriesForm } from "./duty-series-form";
const definition = dutySeriesDefinitionSchema.parse({ timingKind: "interval", startsAt: "2030-10-10T06:00:00Z", endsAt: "2030-10-10T16:00:00Z", intervalMinutes: 120, places: 3 });
const series: DutySeries = { id: "a0000000-0000-4000-8000-000000000001", dutyTypeId: "type", name: "Café", revision: 6, definition };
const duties: Duty[] = [1, 2, 3, 4, 5].map(position => ({ id: `duty${position}`, seriesId: series.id, position, dutyTypeId: series.dutyTypeId, name: "Café", revision: 1, timingKind: "interval", startsAt: definition.startsAt, endsAt: definition.endsAt, dueAt: null, instructions: "", slots: [] }));
function elements(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as ReactElement<Record<string, unknown>>; return [el, ...elements(el.props.children)];
}
function render(rows = duties) {
  const propose = vi.fn();
  const tree = elements(DutySeriesEditor({ series, duties: rows, startsAt: definition.startsAt!, endsAt: definition.endsAt!, timeZone: "Europe/Stockholm", propose }));
  return { tree, propose, review: tree.find(el => el.type === DutySeriesForm)?.props.onReview as (d: typeof definition) => void };
}
it("reviews one versioned series command for all instances", () => {
  const { propose, review } = render(); review({ ...definition, intervalMinutes: 60 });
  expect(propose).toHaveBeenCalledWith(expect.objectContaining({ op: "edit_series", seriesId: series.id, revision: 6, definition: expect.objectContaining({ intervalMinutes: 60 }) }), expect.stringContaining("10 pass"));
});
it("blocks removing booked instances or reducing places below bookings", () => {
  const booked = { id: "slot", revision: 1, personId: "player", personName: "Spelare", occupied: true, mine: false, completedAt: null };
  const { review, propose } = render(duties.map(d => ({ ...d, slots: d.position === 5 ? [booked, { ...booked, id: "slot2" }] : [] })));
  expect(() => review({ ...definition, intervalMinutes: 180 })).toThrow("Frigör bokningarna");
  expect(() => review({ ...definition, places: 1 })).toThrow("Antalet platser"); expect(propose).not.toHaveBeenCalled();
});
it("locks completed series and offers one cancellation for editable series", () => {
  const rows = duties.map(d => ({ ...d, slots: [{ id: "slot", revision: 1, personId: "player", personName: "Spelare", occupied: true, mine: false, completedAt: "2030-10-10T08:00:00Z" }] }));
  expect(render(rows).tree.some(el => el.type === DutySeriesForm)).toBe(false);
  const { tree, propose } = render();
  const button = tree.find(el => el.type === "button" && el.props.children === "Ta bort hela uppgiftsserien");
  (button!.props.onClick as () => void)();
  expect(propose).toHaveBeenCalledWith({ op: "cancel_series", seriesId: series.id, revision: 6 }, expect.stringContaining("5 pass"));
});
