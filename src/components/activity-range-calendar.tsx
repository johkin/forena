"use client";
import { useId, useState } from "react";
import { calendarDateLabel, CalendarWeekdays, shiftCalendarDate } from "./activity-date-picker";

/** Build a Monday-first month grid with empty cells outside the month. */
export function monthDates(month: string): (string | null)[] {
  const [year, number] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, number - 1, 1, 12));
  const offset = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) =>
    i < offset || i >= offset + count ? null : `${month}-${String(i - offset + 1).padStart(2, "0")}`);
}

/** Keep manual endpoint entry ordered. */
export function selectRangeDate(start: string, end: string, date: string, edge: "start" | "end") {
  return edge === "start" ? { start: date, end: date > end ? date : end } : { start: date < start ? date : start, end: date };
}
/** First click starts a new interval, second completes it, including reverse selection. */
export function selectCalendarRange(anchor: string | null, date: string) {
  return anchor === null
    ? { start: date, end: date, anchor: date }
    : { start: date < anchor ? date : anchor, end: date < anchor ? anchor : date, anchor: null };
}

/** Select an ordered interval in two clicks while preserving named form values. */
export function ActivityRangeCalendar({ start, end, onChange, startName = "startsOn", endName = "activityEndsOn" }: { start: string; end: string; startName?: string; endName?: string; onChange: (start: string, end: string) => void }) {
  const id = useId();
  const [view, setView] = useState<{ start: string; end: string; month: string }>();
  const [anchor, setAnchor] = useState<string | null>(null);
  const [focusDate, setFocusDate] = useState(start);
  const month = view?.start === start && view.end === end ? view.month : start.slice(0, 7);
  const cells = monthDates(month);
  const waiting = anchor !== null && start === anchor && end === anchor;
  const monthLabel = new Intl.DateTimeFormat("sv-SE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
  /** Browse months without changing the selected interval. */
  function move(direction: number) {
    const date = new Date(`${month}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + direction);
    setView({ start, end, month: date.toISOString().slice(0, 7) });
  }
  /** Start or complete the current two-click interval. */
  function pick(date: string) {
    const next = selectCalendarRange(waiting ? anchor : null, date);
    setAnchor(next.anchor);
    setFocusDate(date);
    setView({ start: next.start, end: next.end, month: date.slice(0, 7) });
    onChange(next.start, next.end);
  }
  /** Apply a nonempty manual endpoint and end pending click selection. */
  function enter(date: string, edge: "start" | "end") {
    if (!date) return;
    const next = selectRangeDate(start, end, date, edge);
    setAnchor(null);
    setFocusDate(date);
    setView({ ...next, month: date.slice(0, 7) });
    onChange(next.start, next.end);
  }
  return <div className="activity-date-picker activity-range-calendar" role="group" aria-label="Datumintervall">
    <input type="hidden" name={startName} value={start} /><input type="hidden" name={endName} value={end} />
    <div className="activity-calendar-heading"><strong>{monthLabel}</strong><div><button className="icon-button" type="button" aria-label="Föregående månad" onClick={() => move(-1)}>‹</button><button className="icon-button" type="button" aria-label="Nästa månad" onClick={() => move(1)}>›</button></div></div>
    <CalendarWeekdays />
    <div className="activity-month-days">{cells.map((date, i) => date ? <button type="button" key={date} id={`${id}-${date}`} data-endpoint={date === start || date === end} data-in-range={!waiting && start !== end && date >= start && date <= end} data-range-start={date === start} data-range-end={date === end} aria-pressed={date >= start && date <= end} aria-label={`${calendarDateLabel(date)}${date === start ? ", startdag" : ""}${date === end && !waiting ? ", slutdag" : ""}`} tabIndex={date === focusDate || (!cells.includes(focusDate) && date.endsWith("-01")) ? 0 : -1} onClick={() => pick(date)} onKeyDown={event => {
      const days = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key];
      if (days) {
        event.preventDefault();
        const next = shiftCalendarDate(date, days);
        setFocusDate(next);
        setView({ start, end, month: next.slice(0, 7) });
        requestAnimationFrame(() => document.getElementById(`${id}-${next}`)?.focus());
      }
    }}><strong className="activity-day-number">{Number(date.slice(-2))}</strong></button> : <span key={i} />)}</div>
    <span className="visually-hidden" role="status">{waiting ? "Välj slutdatum" : `Valt intervall: ${calendarDateLabel(start)} till ${calendarDateLabel(end)}`}</span>
    <details className="activity-date-alternative"><summary>Välj andra datum</summary><div className="calendar-range-inputs">
      <label>Startdatum<input type="date" value={start} onChange={event => enter(event.target.value, "start")} /></label>
      <label>Slutdatum<input type="date" min={start} value={end} onChange={event => enter(event.target.value, "end")} /></label>
    </div></details>
  </div>;
}
