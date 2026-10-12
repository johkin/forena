"use client";
import { useId, useRef, useState } from "react";

export function shiftCalendarDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function weekDates(value: string) {
  const day = new Date(`${value}T12:00:00Z`).getUTCDay();
  const monday = shiftCalendarDate(value, -((day + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => shiftCalendarDate(monday, index));
}
export function calendarDateLabel(value: string) {
  return new Intl.DateTimeFormat("sv-SE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}
export function CalendarWeekdays() {
  return <div className="activity-month-weekdays" aria-hidden="true">{["M", "T", "O", "T", "F", "L", "S"].map((day, index) => <span key={index}>{day}</span>)}</div>;
}

type Props = {
  name?: string; value: string; onChange: (value: string) => void;
  label?: string; min?: string; max?: string; required?: boolean;
};
/** Local dates only. The native alternative preserves validation and quick year entry. */
export function ActivityDatePicker({ name, value, onChange, label = "Datum", min, max, required }: Props) {
  const id = useId();
  const alternative = useRef<HTMLDetailsElement>(null);
  const [browsing, setBrowsing] = useState<{ value: string; week: string }>();
  const fallback = new Date().toISOString().slice(0, 10);
  const week = browsing?.value === value ? browsing.week : value || min || max || fallback;
  const cells = weekDates(week);
  const available = (date: string) => (!min || date >= min) && (!max || date <= max);
  const focusDate = cells.includes(value) && available(value) ? value : cells.find(available);
  const formatter = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const weekLabel = formatter.formatRange(new Date(`${cells[0]}T12:00:00Z`), new Date(`${cells[6]}T12:00:00Z`));
  function select(date: string) {
    if (date && !available(date)) return;
    setBrowsing(undefined);
    onChange(date);
  }
  return <div className="activity-date-picker" role="group" aria-label={label}>
    <div className="activity-calendar-heading"><strong>{weekLabel}</strong><div>
      <button className="icon-button" type="button" aria-label="Föregående vecka" disabled={!!min && cells[0] <= min} onClick={() => setBrowsing({ value, week: shiftCalendarDate(week, -7) })}>‹</button>
      <button className="icon-button" type="button" aria-label="Nästa vecka" disabled={!!max && cells[6] >= max} onClick={() => setBrowsing({ value, week: shiftCalendarDate(week, 7) })}>›</button>
    </div></div>
    <CalendarWeekdays />
    <div className="activity-week-strip">{cells.map(date => <button key={date} id={`${id}-${date}`} type="button" disabled={!available(date)} aria-label={calendarDateLabel(date)} aria-pressed={date === value} tabIndex={date === focusDate ? 0 : -1} onClick={() => select(date)} onKeyDown={event => {
      const days = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key];
      if (days) {
        event.preventDefault();
        const next = shiftCalendarDate(date, days);
        if (!available(next)) return;
        select(next);
        requestAnimationFrame(() => document.getElementById(`${id}-${next}`)?.focus());
      }
    }}><strong className="activity-day-number">{Number(date.slice(-2))}</strong></button>)}</div>
    <details ref={alternative} className="activity-date-alternative" open={!value || undefined}><summary>Välj annat datum</summary>
      <label className="activity-calendar-selected">{label}<input name={name} type="date" value={value} min={min} max={max} required={required} onInvalid={() => { if (alternative.current) alternative.current.open = true; }} onChange={event => { if (event.target.value || !value) select(event.target.value); }} /></label>
    </details>
  </div>;
}
