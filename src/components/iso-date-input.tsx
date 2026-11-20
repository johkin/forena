"use client";

import { useState, type ComponentPropsWithoutRef } from "react";
import { isoDateSchema } from "../lib/iso-date";

type Props = Pick<ComponentPropsWithoutRef<"input">,
  "name" | "value" | "defaultValue" | "required" | "autoComplete" | "onChange" | "onInvalid"
> & { min?: string; max?: string };

export function IsoDateInput({ min, max, onChange, ...props }: Props) {
  function validate(input: HTMLInputElement) {
    const { value } = input;
    let error = "";
    if (value && !isoDateSchema.safeParse(value).success) {
      error = "Ange ett giltigt datum i formatet ÅÅÅÅ-MM-DD.";
    } else if (value && min && value < min) {
      error = `Datumet måste vara ${min} eller senare.`;
    } else if (value && max && value > max) {
      error = `Datumet måste vara ${max} eller tidigare.`;
    }
    input.setCustomValidity(error);
  }

  return <input
    {...props}
    type="text"
    placeholder="ÅÅÅÅ-MM-DD"
    title="ÅÅÅÅ-MM-DD"
    pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
    ref={input => { if (input) validate(input); }}
    onChange={event => {
      validate(event.currentTarget);
      onChange?.(event);
    }}
  />;
}

/** Keep partial edits in the text field until the calendar has a valid date to display. */
export function IsoCalendarInput({ value, onDateChange, ...props }: Omit<Props, "value" | "defaultValue" | "onChange"> & {
  value: string;
  onDateChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState<{ date: string; text: string }>();
  if (draft && draft.date !== value) setDraft(undefined);

  return <IsoDateInput {...props} value={draft?.date === value ? draft.text : value} onChange={event => {
    const input = event.currentTarget;
    if (input.validity.valid) {
      setDraft(undefined);
      onDateChange(input.value);
    } else {
      setDraft({ date: value, text: input.value });
    }
  }} />;
}
