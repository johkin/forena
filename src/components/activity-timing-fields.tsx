"use client";
import { durationToMinutes, type ActivityTimingRules } from "@/lib/activity-time-rules";
import type { ResolvedActivityDefaults } from "@/lib/activity-defaults";
const sources = { system:"System",organization:"Klubb",section:"Sektion",team:"Lag",fallback:"Grundvärde" };
type Props = { rules: ActivityTimingRules; onChange: (key: keyof ActivityTimingRules, value: string | string[]) => void; defaults?: ResolvedActivityDefaults; touched: ReadonlySet<keyof ActivityTimingRules>; invitations: boolean };
export function ActivityTimingFields({ rules,onChange,defaults,touched,invitations }: Props) {
  function source(key: keyof ActivityTimingRules) { return defaults ? <small>{touched.has(key) ? "Eget val" : `Förval: ${sources[defaults.sources[key].scope]}`}</small> : null; }
  function rule(key:"gatheringRule"|"invitationRule"|"responseDueRule", label:string, suggestions:string[]) {
    return <label>{label}<input list={`timing-${key}`} value={rules[key]} onChange={e=>onChange(key,e.target.value)} required maxLength={80}/><datalist id={`timing-${key}`}>{suggestions.map(value=><option key={value} value={value}/>)}</datalist>{source(key)}</label>;
  }
  return <div className="settings-fields">
    {!invitations ? <><label>Längd (minuter)<input type="number" min={1} max={1440} value={/^PT/.test(rules.duration) ? Number(rules.duration.match(/^PT([0-9]+)M$/)?.[1] ?? durationToMinutes(rules.duration)) : ""} onChange={e=>onChange("duration",`PT${e.target.value || "0"}M`)} required/>{source("duration")}</label>{rule("gatheringRule","Samling",["start","start-15m","start-30m","start-45m","start-60m"])}</> : <>{rule("invitationRule","Skicka kallelsen",["start-14d","start-7d","start-6d","start-3d","start-1d"])}{rule("responseDueRule","Svara senast",["start","start-1h","start-2h","start-6h","start-1d/d"])}<label>Påminnelser<input value={rules.reminderRules.join(", ")} onChange={e=>onChange("reminderRules",e.target.value.trim() ? e.target.value.split(",").map(s=>s.trim()) : [])} placeholder="Inga påminnelser"/>{source("reminderRules")}</label></>}
  </div>;
}
