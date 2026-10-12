"use client";
import { useId } from "react";

export function DutyPlacesStepper({ value, onChange, label = "Antal platser", disabled = false }: { value: number; onChange: (value: number) => void; label?: string; disabled?: boolean }) {
  const id = useId();
  const step = (direction: number) => onChange(Math.min(50, Math.max(1, Math.trunc(value) + direction)));
  return <div className="duty-places-stepper">
    <label htmlFor={id}>{label}</label>
    <div role="group" aria-label={label}>
      <button type="button" disabled={disabled || value <= 1} aria-label={`${label}, minska med en`} onClick={() => step(-1)}>−</button>
      <input id={id} type="number" min={1} max={50} step={1} disabled={disabled} value={value} onChange={event => onChange(Number(event.target.value))}/>
      <button type="button" disabled={disabled || value >= 50} aria-label={`${label}, öka med en`} onClick={() => step(1)}>+</button>
    </div>
  </div>;
}
