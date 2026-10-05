"use client";
import { useMemo } from "react";
import type { ActivityTimingRules } from "@/lib/activity-time-rules";
import type { ResolvedActivityDefaults } from "@/lib/activity-defaults";
import { createTimingChoiceFilter, FALLBACK_TIMING_OPTIONS, timingChoices, type TimingField } from "@/lib/activity-timing-options";
const sources = { system:"System",organization:"Klubb",section:"Sektion",team:"Lag",fallback:"Grundvärde" };
type Props = { rules: ActivityTimingRules; onChange: (key: keyof ActivityTimingRules, value: string | string[]) => void; defaults?: ResolvedActivityDefaults; touched: ReadonlySet<keyof ActivityTimingRules>; invitations: boolean; starts?: readonly string[]; timeZone?: string; contextError?: string };

export function ReminderChoices({ values, options, onChange, isAllowed = () => true, disabled = false }: { values: string[]; options: string[]; onChange: (values: string[]) => void; isAllowed?: (value: string, others: string[]) => boolean; disabled?: boolean }) {
  const choices = timingChoices("reminderRules", options, values);
  const available = options.filter(value => !values.includes(value) && isAllowed(value, values));
  return <fieldset><legend>Påminnelser</legend><small>Tiderna räknas före sista svarstid. Bara obesvarade får påminnelser.</small>
    {!values.length ? <p>Inga påminnelser</p> : null}
    {values.map((value, index) => {
      const others = values.filter((_, i) => i !== index);
      const valid = isAllowed(value, others);
      return <div key={index}><div className="timing-choice-row"><label>Påminnelse {index + 1}<select value={value} disabled={disabled} aria-invalid={!valid} onChange={event => onChange(values.map((item, i) => i === index ? event.target.value : item))}>{choices.filter(choice => choice.value === value || (!values.includes(choice.value) && isAllowed(choice.value, others))).map(choice => <option key={choice.value} value={choice.value} disabled={!isAllowed(choice.value, others)}>{choice.label}{choice.value === value && !valid ? " (ogiltig tid)" : ""}</option>)}</select></label><button type="button" className="secondary" aria-label={`Ta bort påminnelse ${index + 1}`} onClick={() => onChange(others)}>Ta bort</button></div>
        {!valid && !disabled ? <small className="auth-error">Välj en annan tid eller ta bort påminnelsen. Den måste ligga efter kallelsen och före sista svarstid, utan att sammanfalla med en annan påminnelse.</small> : null}
      </div>;
    })}
    <button type="button" className="secondary" disabled={disabled || values.length >= 5 || !available.length} onClick={() => onChange([...values, available[0]])}>Lägg till påminnelse</button>
  </fieldset>;
}
export function ActivityTimingFields({ rules,onChange,defaults,touched,invitations,starts,timeZone,contextError }: Props) {
  const options = defaults?.options ?? FALLBACK_TIMING_OPTIONS;
  const isAllowed = useMemo(() => starts && timeZone && !contextError ? createTimingChoiceFilter(rules, starts, timeZone) : () => true, [rules, starts, timeZone, contextError]);
  function source(key: keyof ActivityTimingRules) { return defaults ? <small>{touched.has(key) ? "Eget val" : `Förval: ${sources[defaults.sources[key].scope]}`}</small> : null; }
  function rule(key: Exclude<TimingField, "reminderRules">, label: string) {
    const valid = isAllowed(key, rules[key]);
    return <label>{label}<select value={rules[key]} disabled={Boolean(contextError)} aria-invalid={!valid} onChange={event => onChange(key,event.target.value)}>{timingChoices(key, options[key], [rules[key]]).filter(choice => choice.value === rules[key] || isAllowed(key, choice.value)).map(choice => <option key={choice.value} value={choice.value} disabled={!isAllowed(key, choice.value)}>{choice.label}{choice.value === rules[key] && !valid ? " (ogiltig tid)" : ""}</option>)}</select>{source(key)}{!valid ? <small className="auth-error">Välj en annan tid. Kallelsen måste skickas före sista svarstid, och sista svarstid får inte ligga efter start.</small> : null}</label>;
  }
  return <div className="settings-fields">
    {!invitations ? <>{rule("duration","Längd")}{rule("gatheringRule","Samling före start")}</> : <>{rule("invitationRule","Skicka kallelsen före start")}{rule("responseDueRule","Svara senast före start")}<div>{contextError ? <p className="auth-error" role="status">{contextError}</p> : null}<ReminderChoices disabled={Boolean(contextError)} isAllowed={(value, others) => isAllowed("reminderRules", value, others)} values={rules.reminderRules} options={options.reminderRules} onChange={values => onChange("reminderRules", values)}/>{source("reminderRules")}</div></>}
  </div>;
}
