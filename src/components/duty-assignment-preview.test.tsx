import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { DutySchedule, Duty } from "@/lib/activity-duty-schedule";
import { DutyAssignmentPreview } from "./duty-assignment-preview";
const slot = (id: string) => ({ id, revision: 1, personId: null, personName: null, occupied: false, mine: false, completedAt: null });
const duty: Duty = { id: "d1", dutyTypeId: "type", revision: 1, name: "Försäljning", timingKind: "interval", startsAt: "2026-10-11T06:00:00Z", endsAt: "2026-10-11T08:00:00Z", dueAt: null, instructions: "", slots: [slot("s1"), slot("s2"), slot("skipped")] };
const schedule: DutySchedule = { duties: [duty, { ...duty, id: "d2", name: "Bakning", timingKind: "deadline", startsAt: null, endsAt: null, dueAt: "2026-10-11T06:30:00Z", slots: [slot("s3")] }],
  people: [{ id: "p1", name: "Alex Exempel" }, { id: "p2", name: "Kim <Exempel>" }, { id: "p3", name: "Robin Exempel" }],
  isWork: true, canManage: true, claimRequiresApproval: false, changeRequiresApproval: false, selfServiceUntil: "2026-10-11T06:00:00Z", types: [], requests: [] };
const assignments = [{ slotId: "s1", personId: "p2", revision: 1 }, { slotId: "s2", personId: "p1", revision: 1 }, { slotId: "s3", personId: "p3", revision: 1 }];
const render = (value = schedule) => renderToStaticMarkup(<DutyAssignmentPreview assignments={assignments} schedule={value} timeZone="Europe/Stockholm" />);
it("groups exact reviewed assignments into an accessible table with one date heading", () => {
  const html = render();
  expect(html.match(/<table /g)).toHaveLength(1);
  expect(html).toContain("<caption>söndag 11 oktober 2026</caption>");
  expect(html).toContain('<th scope="col">Tid</th>');
  expect(html).toContain('<th scope="row">Försäljning</th>');
  expect(html).toContain("08:00–10:00");
  expect(html).toContain("Lämnas senast 08:30");
  expect(html).toContain("Kim &lt;Exempel&gt;<small>Plats 1</small>");
  expect(html).toContain("Alex Exempel<small>Plats 2</small>");
  expect(html).not.toContain("Plats 3");
  expect(html).not.toContain("2026-10-11");
});
it("separates dates and untimed duties without losing assignment names", () => {
  const html = render({ ...schedule, duties: [
    { ...duty, startsAt: "2026-10-12T06:00:00Z", endsAt: "2026-10-12T08:00:00Z" },
    { ...schedule.duties[1], timingKind: "none", dueAt: null },
  ] });
  expect(html.match(/<table /g)).toHaveLength(2);
  expect(html).toContain("måndag 12 oktober 2026");
  expect(html).toContain("Utan särskild tid");
  expect(html).toContain("Robin Exempel");
});
it("keeps both dates visible for an overnight shift", () => {
  const html = render({ ...schedule, duties: [{ ...duty, startsAt: "2026-10-11T21:00:00Z", endsAt: "2026-10-12T01:00:00Z" }] });
  expect(html).toContain("11 okt. 2026 23:00–12 okt. 2026 03:00");
});
