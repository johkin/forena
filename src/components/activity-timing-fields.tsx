"use client";
import type { ActivityTimingRules } from "@/lib/activity-time-rules";
import type { ResolvedActivityDefaults } from "@/lib/activity-defaults";
import { FALLBACK_TIMING_OPTIONS, timingChoices, type TimingField } from "@/lib/activity-timing-options";
const sources = { system:"System",organization:"Klubb",section:"Sektion",team:"Lag",fallback:"Grundvärde" };
type Props = { rules: ActivityTimingRules; onChange: (key: keyof ActivityTimingRules, value: string | string[]) => void; defaults?: ResolvedActivityDefaults; touched: ReadonlySet<keyof ActivityTimingRules>; invitations: boolean };

export function ReminderChoices({ values, options, onChange }: { values: string[]; options: string[]; onChange: (values: string[]) => void }) {
  const choices = timingChoices("reminderRules", options, values);
  const available = options.filter(value => !values.includes(value));
  return <fieldset><legend>Påminnelser</legend><small>Tiderna räknas före sista svarstid. Bara obesvarade får påminnelser.</small>
    {!values.length ? <p>Inga påminnelser</p> : null}
    {values.map((value, index) => <div className="timing-choice-row" key={index}><label>Påminnelse {index + 1}<select value={value} onChange={event => onChange(values.map((item, i) => i === index ? event.target.value : item))}>{choices.filter(choice => choice.value === value || !values.includes(choice.value)).map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label><button type="button" className="secondary" aria-label={`Ta bort påminnelse ${index + 1}`} onClick={() => onChange(values.filter((_, i) => i !== index))}>Ta bort</button></div>)}
    <button type="button" className="secondary" disabled={values.length >= 5 || !available.length} onClick={() => onChange([...values, available[0]])}>Lägg till påminnelse</button>
  </fieldset>;
}
export function ActivityTimingFields({ rules,onChange,defaults,touched,invitations }: Props) {
  const options = defaults?.options ?? FALLBACK_TIMING_OPTIONS;
  function source(key: keyof ActivityTimingRules) { return defaults ? <small>{touched.has(key) ? "Eget val" : `Förval: ${sources[defaults.sources[key].scope]}`}</small> : null; }
  function rule(key: Exclude<TimingField, "reminderRules">, label: string) {
    return <label>{label}<select value={rules[key]} onChange={event => onChange(key,event.target.value)}>{timingChoices(key, options[key], [rules[key]]).map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select>{source(key)}</label>;
  }
  return <div className="settings-fields">
    {!invitations ? <>{rule("duration","Längd")}{rule("gatheringRule","Samling före start")}</> : <>{rule("invitationRule","Skicka kallelsen före start")}{rule("responseDueRule","Svara senast före start")}<div><ReminderChoices values={rules.reminderRules} options={options.reminderRules} onChange={values => onChange("reminderRules", values)}/>{source("reminderRules")}</div></>}
  </div>;
}
