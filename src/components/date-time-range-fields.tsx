"use client";
import { useId } from "react";
import { ActivityDatePicker } from "./activity-date-picker";
import { ActivityRangeCalendar } from "./activity-range-calendar";
import { ActivityTimeStepper } from "./activity-time-stepper";

type Props = {
  startDate: string; endDate: string; startTime: string; endTime: string;
  mode: "single" | "multi"; onModeChange?: (mode: "single" | "multi") => void;
  onDatesChange: (start: string, end: string) => void;
  onStartTimeChange: (time: string) => void; onEndTimeChange?: (time: string) => void;
  startLabel?: string;
  names?: { startDate: string; endDate: string; startTime: string; endTime: string };
};
/** Calendar and time controls shared by activities, duty intervals and deadlines. */
export function DateTimeRangeFields({ startDate, endDate, startTime, endTime, mode, onModeChange, onDatesChange, onStartTimeChange, onEndTimeChange, startLabel = "Starttid", names }: Props) {
  const id = useId();
  const fields = names ?? {startDate:`${id}-start-date`,endDate:`${id}-end-date`,startTime:`${id}-start-time`,endTime:`${id}-end-time`};
  return <div className="date-time-range-fields">
    {onEndTimeChange && onModeChange ? <div className="segmented-control editor-day-tabs" role="group" aria-label="Datumläge"><button type="button" aria-pressed={mode==="single"} onClick={()=>onModeChange("single")}>Samma dag</button><button type="button" aria-pressed={mode==="multi"} onClick={()=>onModeChange("multi")}>Flerdagars</button></div> : null}
    {mode==="multi" && onEndTimeChange ? <ActivityRangeCalendar start={startDate} end={endDate} startName={fields.startDate} endName={fields.endDate} onChange={onDatesChange}/> : <ActivityDatePicker required name={fields.startDate} value={startDate} onChange={date=>onDatesChange(date,onEndTimeChange ? date : endDate)}/>}
    <div className={`editor-time-steppers${onEndTimeChange ? "" : " single-time"}`}><ActivityTimeStepper name={fields.startTime} label={startLabel} value={startTime} onChange={onStartTimeChange}/>{onEndTimeChange ? <ActivityTimeStepper name={fields.endTime} label="Sluttid" value={endTime} onChange={onEndTimeChange}/> : null}</div>
  </div>;
}
