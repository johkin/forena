"use client";

import { useState, useSyncExternalStore } from "react";
import { allCalendarFilters, calendarFiltersSchema, personFilterKey, type CalendarFilters, type CalendarScope, type CalendarTeam } from "../lib/personal-calendar";

const changeEvent = "forena-calendar-filters";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(changeEvent, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(changeEvent, callback); };
}

/** Only IDs are persisted, under the authenticated account's own key. */
export function useCalendarFilters(accountId?: string) {
  const [temporary, setTemporary] = useState({ accountId, filters: allCalendarFilters });
  const key = accountId ? `forena:calendar:v1:${accountId}` : undefined;
  const serialized = useSyncExternalStore(subscribe, () => {
    try { return key ? window.localStorage.getItem(key) : null; } catch { return null; }
  }, () => null);
  let filters = allCalendarFilters;
  try {
    const result = calendarFiltersSchema.safeParse(serialized ? JSON.parse(serialized) : null);
    if (result.success) filters = result.data;
  } catch { /* An invalid saved preference falls back to all. */ }
  const save = (next: CalendarFilters) => {
    setTemporary({ accountId, filters: next });
    if (!key) return;
    try { window.localStorage.setItem(key, JSON.stringify({ version: 1, ...next })); } catch { return; }
    window.dispatchEvent(new Event(changeEvent));
  };
  return [serialized ? filters : temporary.accountId === accountId ? temporary.filters : allCalendarFilters, save] as const;
}

function toggle(current: string[] | null, id: string, available: string[]) {
  if (current === null) return [id];
  const selected = new Set(current);
  if (selected.has(id)) selected.delete(id); else selected.add(id);
  return available.every(value => selected.has(value)) ? null : [...selected];
}

export function CalendarFiltersView({ scope, teams, value, onChange }: { scope: CalendarScope; teams: CalendarTeam[]; value: CalendarFilters; onChange: (value: CalendarFilters) => void }) {
  const people = [...new Map(scope.people.map(person => [personFilterKey(person), { id: personFilterKey(person), name: person.isSelf ? "Mina aktiviteter" : person.displayName }])).values()];
  const showPeople = scope.people.some(person => !person.isSelf) && people.length > 1;
  return <>
    {showPeople ? <div className="personal-team-filters" role="group" aria-label="Filtrera på person">
      <button className="personal-filter-chip" type="button" aria-pressed={value.people === null} onClick={() => onChange({ ...value, people: null, teams: null })}>Alla personer</button>
      {people.map(person => <button className="personal-filter-chip" key={person.id} type="button" aria-pressed={value.people?.includes(person.id) ?? false} onClick={() => onChange({ ...value, people: toggle(value.people, person.id, people.map(person => person.id)), teams: null })}>{person.name}</button>)}
    </div> : null}
    {teams.length > 1 ? <div className="personal-team-filters" role="group" aria-label="Filtrera på lag">
      <button className="personal-filter-chip" type="button" aria-pressed={value.teams === null} onClick={() => onChange({ ...value, teams: null })}>Alla lag</button>
      {teams.map(team => <button className="personal-filter-chip" key={team.id} type="button" aria-pressed={value.teams?.includes(team.id) ?? false} onClick={() => onChange({ ...value, teams: toggle(value.teams, team.id, teams.map(team => team.id)) })}>{team.name}</button>)}
    </div> : null}
  </>;
}
