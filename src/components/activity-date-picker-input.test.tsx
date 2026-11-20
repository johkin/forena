import { expect, it, vi } from "vitest";
import type { ChangeEvent } from "react";
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useState: () => [undefined, vi.fn()], useRef: () => ({current:null}), useId: () => "date-test" }));
import { IsoCalendarInput } from "./iso-date-input";

it.each([false, true])("keeps invalid edits out of calendar selections with required=%s", required => {
  const onDateChange = vi.fn();
  const { props } = IsoCalendarInput({ value: "2026-10-16", required, onDateChange });
  function edit(value: string, valid: boolean) {
    const input = { value, validity: { valid } };
    props.onChange({ currentTarget: input } as ChangeEvent<HTMLInputElement>);
  }
  edit("2026-10", false);
  expect(onDateChange).not.toHaveBeenCalled();
  edit("", !required);
  if (required) expect(onDateChange).not.toHaveBeenCalled();
  else expect(onDateChange).toHaveBeenCalledWith("");
  edit("2026-10-17", true);
  expect(onDateChange).toHaveBeenLastCalledWith("2026-10-17");
});
