import { expect, it } from "vitest";
import { resolveDraftActivityType } from "./activity-draft-type";
import { normalizeActivityDraft } from "./activity-draft";

const types = [
  { id: "00000000-0000-0000-0000-000000000001", name: "Träning", category: "session" },
  { id: "00000000-0000-0000-0000-000000000002", name: "Övrigt", category: "other" },
  { id: "00000000-0000-0000-0000-000000000003", name: "Målvaktsträning", category: "session" },
];
const draft = { title: "Träning", description: "Välkommen", location: "Planen", startsOn: "2026-10-20", startTime: "18:00", durationMinutes: 90, gatheringMinutesBefore: 0, recurrence: { weekdays: [2], endsOn: null } } as const;
it.each([undefined, types[1].id])("selects training for recurring sessions even when the model chose %s", activityTypeId => {
  expect(resolveDraftActivityType(normalizeActivityDraft({ ...draft, recurrence: { ...draft.recurrence, weekdays: [2] }, activityTypeId }), "Fixa återkommande träningar varje tisdag", types)).toBe(types[0].id);
});
it("preserves an explicitly selected training subtype", () => {
  expect(resolveDraftActivityType({ ...draft, recurrence: null, activityTypeId: types[2].id }, "Skapa en träning för målvakter", types)).toBe(types[2].id);
});
it("rejects invented or unavailable catalogue IDs", () => {
  expect(() => resolveDraftActivityType({ ...draft, recurrence: null, activityTypeId: "missing" }, "Skapa en träning", types)).toThrow("inte tillgänglig");
});
it("keeps the selected type through draft normalization", () => {
  expect(normalizeActivityDraft({ ...draft, recurrence: null, activityTypeId: types[0].id })).toHaveProperty("activityTypeId", types[0].id);
});
it("requires an explicit choice when no suitable training type is available", () => {
  expect(() => resolveDraftActivityType({ ...draft, recurrence: null }, "Skapa träningar", [types[1]])).toThrow("Välj en tillgänglig");
});
