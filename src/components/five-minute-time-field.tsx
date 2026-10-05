"use client";

import { useState } from "react";

const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

export function FiveMinuteTimeField({ name, defaultValue, label = "Tid" }: { name: string; defaultValue: string; label?: string }) {
  const [time, setTime] = useState(defaultValue);
  const [hour, minute] = time.split(":");
  return <div className="five-minute-time-field" role="group" aria-label={label}>
    <span>{label}</span>
    <div className="five-minute-time-selects">
      <select aria-label={`${label}, timme`} value={hour} onChange={event => setTime(`${event.target.value}:${minute}`)}>
        {hours.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
      <span aria-hidden="true">:</span>
      <select aria-label={`${label}, minut`} value={minute} onChange={event => setTime(`${hour}:${event.target.value}`)}>
        {!minutes.includes(minute) ? <option value={minute}>{minute} (befintlig)</option> : null}
        {minutes.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
    </div>
    <input type="hidden" name={name} value={time}/>
  </div>;
}
