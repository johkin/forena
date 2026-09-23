"use client";

import { useMemo, useState } from "react";
import type { Activity } from "@/domain/club";

type Props = { activities: Activity[]; timeZone: string; onSelectActivity: (activity: Activity) => void };

function localDateKey(value: string, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function TeamCalendar({ activities, timeZone, onSelectActivity }: Props) {
  const initial = activities[0] ? localDateKey(activities[0].startsAt, timeZone) : localDateKey(new Date().toISOString(), timeZone);
  const [cursor, setCursor] = useState(() => {
    const [year, month] = initial.split("-").map(Number);
    return { year, month };
  });
  const formatter = useMemo(() => new Intl.DateTimeFormat("sv-SE", { timeZone, hour: "2-digit", minute: "2-digit" }), [timeZone]);
  const title = new Intl.DateTimeFormat("sv-SE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(cursor.year, cursor.month - 1, 1)));
  const first = new Date(Date.UTC(cursor.year, cursor.month - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate();
  const byDate = new Map<string, Activity[]>();
  for (const activity of activities) {
    const key = localDateKey(activity.startsAt, timeZone);
    byDate.set(key, [...(byDate.get(key) ?? []), activity]);
  }
  function move(delta: number) {
    const next = new Date(Date.UTC(cursor.year, cursor.month - 1 + delta, 1));
    setCursor({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 });
  }

  return <section className="card team-calendar calendar-page" aria-labelledby="calendar-title">
    <div className="calendar-heading"><div><p className="eyebrow">Lagets kalender</p><h2 id="calendar-title">{title}</h2></div><div><button className="secondary" onClick={() => move(-1)} type="button" aria-label="Föregående månad">←</button><button className="secondary" onClick={() => move(1)} type="button" aria-label="Nästa månad">→</button></div></div>
    <div className="calendar-weekdays">{["Mån","Tis","Ons","Tor","Fre","Lör","Sön"].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="calendar-grid">
      {Array.from({ length: 42 }, (_, index) => {
        const day = index - offset + 1;
        if (day < 1 || day > days) return <div className="calendar-day empty" key={index} />;
        const key = `${cursor.year}-${String(cursor.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const items = byDate.get(key) ?? [];
        return <div className={`calendar-day ${items.length ? "has-activity" : ""}`} key={key}>
          <strong>{day}</strong>
          {items.slice(0, 4).map((item) => <button className="calendar-event" key={item.id} onClick={() => onSelectActivity(item)} type="button" title={item.title}><b>{formatter.format(new Date(item.startsAt))}</b><span>{item.title}</span></button>)}
          {items.length > 4 ? <small>+{items.length - 4} till</small> : null}
        </div>;
      })}
    </div>
  </section>;
}
