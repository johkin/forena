import { z } from "zod";
import type { Activity } from "../domain/club";
import type { OverviewItem } from "../components/personal-overview-types";
import { activityDateKey } from "./activity-range";
import { localActivityTime } from "./activity-time-rules";

export type CalendarPerson = { id: string; displayName: string; isSelf: boolean; teamIds: string[] };
export type CalendarTeam = { id: string; name: string };
export type CalendarScope = { people: CalendarPerson[]; teams: CalendarTeam[] };
export type CalendarMonth<T extends OverviewItem> = CalendarScope & { items: T[]; activities: Activity[] };
export type LoadCalendarMonth<T extends OverviewItem> = (month: string, signal: AbortSignal) => Promise<CalendarMonth<T>>;
export type CalendarFilters = { people: string[] | null; teams: string[] | null };
export const allCalendarFilters: CalendarFilters = { people: null, teams: null };
export const calendarFiltersSchema = z.object({ version: z.literal(1), people: z.array(z.string()).nullable(), teams: z.array(z.string()).nullable() });

export function calendarMonth(value: string) {
  return activityDateKey(value, "Europe/Stockholm").slice(0, 7);
}

/** Half-open Stockholm month, including offset changes at daylight saving time. */
export function calendarMonthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 1900 || Number(month.slice(0, 4)) > 9998) {
    throw new Error("Ogiltig kalendermånad.");
  }
  const [year, number] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10);
  return { from: localActivityTime(`${month}-01`, "00:00", "Europe/Stockholm").toISOString(), until: localActivityTime(next, "00:00", "Europe/Stockholm").toISOString() };
}

export function personFilterKey(person: CalendarPerson) { return person.isSelf ? "self" : person.id; }

export function calendarSelection<T extends OverviewItem>(items: T[], activities: Activity[], scope: CalendarScope, filters: CalendarFilters) {
  const peopleById = new Map(scope.people.map(person => [person.id, person]));
  const availablePeople = new Set(scope.people.map(personFilterKey));
  const showPeople = scope.people.some(person => !person.isSelf) && availablePeople.size > 1;
  const validPeople = filters.people?.filter(id => availablePeople.has(id)) ?? null;
  const selectedPersonKeys = !showPeople || (filters.people?.length && !validPeople?.length) ? null : validPeople;
  const selectedPeople = scope.people.filter(person => selectedPersonKeys === null || selectedPersonKeys.includes(personFilterKey(person)));
  const relevantTeams = new Set(selectedPeople.flatMap(person => person.teamIds));
  // Manager-only rows have no represented person; they belong to the own selection.
  const includeOwn = selectedPersonKeys === null || selectedPersonKeys.includes("self");
  const byId = new Map(activities.map(activity => [activity.id, activity]));
  if (includeOwn) for (const item of items.filter(item => item.activityOnly)) {
    const activity = byId.get(item.activity.id);
    if (activity) relevantTeams.add(activity.teamId);
  }
  const teams = scope.teams.filter(team => relevantTeams.has(team.id));
  const validTeams = filters.teams?.filter(id => relevantTeams.has(id)) ?? null;
  const selectedTeamIds = teams.length <= 1 || (filters.teams?.length && !validTeams?.length) ? null : validTeams;
  const effectiveFilters = { people: selectedPersonKeys, teams: selectedTeamIds };
  const visible = items.filter(item => {
    const person = peopleById.get(item.member.id);
    const personSelected = item.activityOnly ? includeOwn : selectedPersonKeys === null || (person && selectedPersonKeys.includes(personFilterKey(person)));
    const teamId = byId.get(item.activity.id)?.teamId;
    return personSelected && teamId && (selectedTeamIds === null || selectedTeamIds.includes(teamId));
  });
  return { items: visible, teams, filters: effectiveFilters };
}

export function attendanceLabel(item: OverviewItem, now: string) {
  if (item.activity.status === "cancelled" || Date.parse(item.activity.endsAt) > Date.parse(now)) return undefined;
  switch (item.attendance) {
    case "present": return { status: "present", text: "Deltog" };
    case "absent": return { status: "absent", text: "Deltog inte" };
    default: return { status: "unknown", text: "Deltagande okänt" };
  }
}


export function overviewCalendarScope(items: OverviewItem[], activities: Activity[]): CalendarScope {
  const byId = new Map(activities.map(activity => [activity.id, activity]));
  const people = new Map<string, CalendarPerson>();
  const teams = new Map<string, CalendarTeam>();
  for (const item of items) {
    const activity = byId.get(item.activity.id);
    if (!activity) continue;
    teams.set(activity.teamId, { id: activity.teamId, name: [item.organization?.name, item.team.name].filter(Boolean).join(" · ") });
    if (item.activityOnly) continue;
    const person: CalendarPerson = people.get(item.member.id) ?? { ...item.member, isSelf: false, teamIds: [] };
    if (!person.teamIds.includes(activity.teamId)) person.teamIds.push(activity.teamId);
    people.set(person.id, person);
  }
  return { people: [...people.values()], teams: [...teams.values()] };
}
