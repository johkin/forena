"use client";
import { useId, useState } from "react";
import { shiftCalendarDate } from "./activity-date-picker";

export function monthDates(month: string): (string | null)[] {
  const [year, number] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, number - 1, 1, 12));
  const offset = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) =>
    i < offset || i >= offset + count ? null : `${month}-${String(i - offset + 1).padStart(2, "0")}`);
}

/** Keep a valid date order while either endpoint is selected or entered. */
export function selectRangeDate(start: string, end: string, date: string, edge: "start" | "end") {
  return edge === "start" ? { start: date, end: date > end ? date : end } : { start: date < start ? date : start, end: date };
}

export function ActivityRangeCalendar({ start, end, onChange, startName="startsOn", endName="activityEndsOn" }: { start: string; end: string; startName?: string; endName?: string; onChange: (start: string, end: string) => void }) {
  const id=useId();
  const [month, setMonth] = useState(start.slice(0, 7));
  const [edge, setEdge] = useState<"start" | "end">("start");
  const cells = monthDates(month);
  const selected = edge === "start" ? start : end;
  const monthLabel = new Intl.DateTimeFormat("sv-SE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
  function move(direction: number) {
    const date = new Date(`${month}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + direction);
    setMonth(date.toISOString().slice(0, 7));
  }
  function pick(date: string, target = edge, advance = false) {
    const range = selectRangeDate(start, end, date, target);
    onChange(range.start, range.end);
    setMonth(date.slice(0, 7));
    if (advance && target === "start") setEdge("end");
  }
  return <div className="activity-date-picker activity-range-calendar" role="group" aria-label="Aktivitetens datumintervall">
    <input type="hidden" name={startName} value={start}/><input type="hidden" name={endName} value={end}/>
    <div className="segmented-control calendar-range-edge" role="group" aria-label="Välj dag att markera">
      <button type="button" aria-pressed={edge === "start"} onClick={() => { setEdge("start"); setMonth(start.slice(0,7)); }}>Startdag</button>
      <button type="button" aria-pressed={edge === "end"} onClick={() => { setEdge("end"); setMonth(end.slice(0,7)); }}>Slutdag</button>
    </div>
    <div className="activity-calendar-heading"><strong>{monthLabel}</strong><div><button className="icon-button" type="button" aria-label="Föregående månad" onClick={() => move(-1)}>‹</button><button className="icon-button" type="button" aria-label="Nästa månad" onClick={() => move(1)}>›</button></div></div>
    <div className="activity-month-weekdays" aria-hidden="true">{["M","T","O","T","F","L","S"].map((day,i) => <span key={i}>{day}</span>)}</div>
    <div className="activity-month-days">{cells.map((date,i) => date ? <button type="button" key={date} id={`${id}-${date}`} data-endpoint={date === start || date === end} data-in-range={date > start && date < end} aria-pressed={date === start || date === end} aria-label={`${new Intl.DateTimeFormat("sv-SE",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${date}T12:00:00Z`))}${date === start ? ", startdag" : ""}${date === end ? ", slutdag" : ""}`} tabIndex={date === selected || (!cells.includes(selected) && date.endsWith("-01")) ? 0 : -1} onClick={() => pick(date,edge,true)} onKeyDown={event => {
      const days = ({ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7} as Record<string,number>)[event.key];
      if (days) { event.preventDefault(); const next=shiftCalendarDate(date,days); pick(next); requestAnimationFrame(() => document.getElementById(`${id}-${next}`)?.focus()); }
    }}><strong className="activity-day-number">{Number(date.slice(-2))}</strong></button> : <span key={i}/>)}</div>
    <div className="calendar-range-inputs"><label>Startdatum<input type="date" value={start} onChange={event => { if(event.target.value)pick(event.target.value,"start"); }}/></label><label>Slutdatum<input type="date" min={start} value={end} onChange={event => { if(event.target.value)pick(event.target.value,"end"); }}/></label></div>
  </div>;
}
