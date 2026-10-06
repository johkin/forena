"use client";

import { useState } from "react";

const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

export function FiveMinuteTimeField({ name, defaultValue, value, label = "Tid", onChange }: { name: string; defaultValue: string; value?: string; label?: string; onChange?: (value: string) => void }) {
  const [time, setTime] = useState(defaultValue);
  function change(value: string) { setTime(value); onChange?.(value); }
  const currentTime = value ?? time;
  const [hour, minute] = currentTime.split(":");
  return <div className="five-minute-time-field" role="group" aria-label={label}>
    <span>{label}</span>
    <div className="five-minute-time-selects">
      <select aria-label={`${label}, timme`} value={hour} onChange={event => change(`${event.target.value}:${minute}`)}>
        {hours.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
      <span aria-hidden="true">:</span>
      <select aria-label={`${label}, minut`} value={minute} onChange={event => change(`${hour}:${event.target.value}`)}>
        {!minutes.includes(minute) ? <option value={minute}>{minute} (befintlig)</option> : null}
        {minutes.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
    </div>
    <input type="hidden" name={name} value={currentTime}/>
  </div>;
}

