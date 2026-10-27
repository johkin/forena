"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { activitiesByDate } from "@/lib/activity-range";
import type { Activity } from "@/domain/club";

type Props = { activities: Activity[]; timeZone: string; onSelectActivity: (activity: Activity) => void; heading?: string; eventLabel?: (activity: Activity) => string; showAllEvents?: boolean; referenceTime?: string; month?: string; onMonthChange?: (month: string) => void; eventContent?: (activity: Activity) => ReactNode; busy?: boolean; focusToday?: boolean };

const formatters = new Map<string, Intl.DateTimeFormat>();
function getFormatter(timeZone: string, optionsKey: string, options: Intl.DateTimeFormatOptions) {
  const key = `${timeZone}:${optionsKey}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("sv-SE", { timeZone, ...options });
    formatters.set(key, formatter);
  }
  return formatter;
}

const enCAFormatters = new Map<string, Intl.DateTimeFormat>();
function getEnCAFormatter(timeZone: string) {
  let formatter = enCAFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    enCAFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function localDateKey(value: string, timeZone: string) {
  const formatter = getEnCAFormatter(timeZone);
  const parts = Object.fromEntries(formatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function TeamCalendar({ activities, timeZone, onSelectActivity, heading = "Lagets kalender", eventLabel = activity => activity.title, showAllEvents = false, referenceTime, month, onMonthChange, eventContent, busy, focusToday = false }: Props) {
  const titleId = useId();
  const todayRef = useRef<HTMLDivElement>(null);
  const today = localDateKey(referenceTime ?? new Date().toISOString(), timeZone);
  const [localCursor, setCursor] = useState(() => {
    const [year, month] = today.split("-").map(Number);
    return { year, month };
  });
  const cursor = month ? { year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)) } : localCursor;
  function changeMonth(year: number, month: number) {
    setCursor({ year, month });
    onMonthChange?.(`${year}-${String(month).padStart(2, "0")}`);
  }
  function revealToday() {
    if (focusToday && !busy && window.matchMedia("(max-width:600px)").matches) todayRef.current?.scrollIntoView({ block: "center" });
  }
  useEffect(() => {
    if (focusToday && !busy && window.matchMedia("(max-width:600px)").matches) todayRef.current?.scrollIntoView({ block: "center" });
  }, [focusToday, busy, cursor.year, cursor.month, today]);
  const formatter = getFormatter(timeZone, "time", { hour: "2-digit", minute: "2-digit" });
  const titleFormatter = getFormatter("UTC", "title", { month: "long", year: "numeric" });
  const title = titleFormatter.format(new Date(Date.UTC(cursor.year, cursor.month - 1, 1)));
  const first = new Date(Date.UTC(cursor.year, cursor.month - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate();
  const byDate = activitiesByDate(activities, timeZone, cursor.year, cursor.month);
  function move(delta: number) {
    const next = new Date(Date.UTC(cursor.year, cursor.month - 1 + delta, 1));
    changeMonth(next.getUTCFullYear(), next.getUTCMonth() + 1);
  }

  return <section className="card team-calendar calendar-page" aria-labelledby={titleId} aria-busy={busy}>
    <div className="calendar-heading"><div><p className="eyebrow">{heading}</p><h2 id={titleId}>{title}</h2></div><div><button className="secondary" onClick={() => { const [year, month] = today.split("-").map(Number); changeMonth(year, month); revealToday(); }} type="button">I dag</button><button className="secondary" onClick={() => move(-1)} type="button" aria-label="Föregående månad">←</button><button className="secondary" onClick={() => move(1)} type="button" aria-label="Nästa månad">→</button></div></div>
    <div className="calendar-weekdays">{["Mån","Tis","Ons","Tor","Fre","Lör","Sön"].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="calendar-grid">
      {Array.from({ length: 42 }, (_, index) => {
        const day = index - offset + 1;
        if (day < 1 || day > days) return <div className="calendar-day empty" key={index} />;
        const key = `${cursor.year}-${String(cursor.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const items = byDate.get(key) ?? [];
        return <div className={`calendar-day ${items.length ? "has-activity" : ""} ${key === today ? "is-today" : ""}`} key={key} ref={key === today ? todayRef : undefined}>
          <strong aria-current={key === today ? "date" : undefined}>{day}<small className="calendar-mobile-weekday">{["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"][index % 7]}</small></strong>
          <div className="calendar-day-activities">{(showAllEvents ? items : items.slice(0, 4)).map((item) => <button className="calendar-event" key={item.id} onClick={() => onSelectActivity(item)} type="button" title={eventLabel(item)}><b>{localDateKey(item.startsAt, timeZone) === key ? formatter.format(new Date(item.startsAt)) : "Fortsätter"}</b><span>{eventLabel(item)}</span>{eventContent?.(item)}</button>)}
          {!showAllEvents && items.length > 4 ? <small>+{items.length - 4} till</small> : null}</div>
        </div>;
      })}
    </div>
  </section>;
}
