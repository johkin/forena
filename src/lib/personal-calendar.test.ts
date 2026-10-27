import { expect, it } from "vitest";
import { attendanceLabel, calendarMonthBounds, calendarSelection, type CalendarScope } from "./personal-calendar";
import type { OverviewItem } from "../components/personal-overview-types";
import type { Activity } from "../domain/club";

const activity: Activity = { id: "a", teamId: "team", organizationId: "club", title: "Träning", location: "Planen", startsAt: "2026-10-12T15:00:00Z", endsAt: "2026-10-12T16:00:00Z" };
const item: OverviewItem = { activity, member: { id: "child", displayName: "Kim" }, team: { name: "Laget" }, invitation: { id: "i", response: "declined" } };
const scope: CalendarScope = {
  people: [{ id: "child", displayName: "Kim", isSelf: false, teamIds: ["team"] }, { id: "self", displayName: "Alex", isSelf: true, teamIds: ["team", "leaders"] }, { id: "sibling", displayName: "Sam", isSelf: false, teamIds: ["other"] }],
  teams: [{ id: "team", name: "Träning" }, { id: "leaders", name: "Ledare" }, { id: "other", name: "Syskonets lag" }],
};
it("uses calendar months across Stockholm daylight saving changes and the year boundary", () => {
  expect(calendarMonthBounds("2026-10")).toEqual({ from: "2026-09-30T22:00:00.000Z", until: "2026-10-31T23:00:00.000Z" });
  expect(calendarMonthBounds("2026-03")).toEqual({ from: "2026-02-28T23:00:00.000Z", until: "2026-03-31T22:00:00.000Z" });
  expect(calendarMonthBounds("2026-12").until).toBe("2026-12-31T23:00:00.000Z");
  for (const value of ["2026-13", "2026-1", "garbage", "1899-12", "9999-12"]) expect(() => calendarMonthBounds(value)).toThrow();
});
it("never treats an invitation response as actual attendance, and leaves future and cancelled events neutral", () => {
  expect(attendanceLabel(item, "2026-10-26T12:00:00Z")?.text).toBe("Deltagande okänt");
  expect(attendanceLabel({ ...item, attendance: "absent" }, "2026-10-26T12:00:00Z")?.text).toBe("Deltog inte");
  expect(attendanceLabel({ ...item, attendance: "present" }, "2026-10-26T12:00:00Z")?.text).toBe("Deltog");
  expect(attendanceLabel({ ...item, attendance: "present" }, "2026-10-01T12:00:00Z")).toBeUndefined();
  expect(attendanceLabel({ ...item, activity: { ...activity, status: "cancelled" }, attendance: "present" }, "2026-10-26T12:00:00Z")).toBeUndefined();
});
it("combines selected people and teams without adding own or sibling activities", () => {
  const meeting = { ...activity, id: "meeting", teamId: "leaders" };
  const sibling = { ...activity, id: "sibling", teamId: "other" };
  const items = [item, { ...item, activity: meeting, member: { id: "self", displayName: "Alex" } }, { ...item, activity: sibling, member: { id: "sibling", displayName: "Sam" } }];
  expect(calendarSelection(items, [activity, meeting, sibling], scope, { people: ["child"], teams: null }).items).toEqual([item]);
  expect(calendarSelection(items, [activity, meeting, sibling], scope, { people: ["child"], teams: null }).teams.map(team => team.id)).toEqual(["team"]);
  expect(calendarSelection(items, [activity, meeting, sibling], scope, { people: ["child", "self"], teams: ["team", "leaders"] }).items.map(item => item.activity.id)).toEqual(["a", "meeting"]);
  expect(calendarSelection(items, [activity, meeting, sibling], scope, { people: null, teams: null }).items).toHaveLength(3);
});


it("preserves own access when a saved child's relationship or team is no longer available", () => {
  const ownItem = { ...item, member: { id: "self", displayName: "Alex" } };
  const ownScope = { people: scope.people.filter(person => person.isSelf), teams: scope.teams };
  const selection = calendarSelection([ownItem], [activity], ownScope, { people: ["former-child"], teams: ["former-team"] });
  expect(selection.items).toEqual([ownItem]);
  expect(selection.filters).toEqual({ people: null, teams: null });
});
