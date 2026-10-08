"use client";
import { useState } from "react";
import { type DisciplineDefaultsPatch, type ResolvedDisciplineDefaults } from "@/lib/discipline-defaults";
import { normalizeTimingOptions, TIMING_FIELDS, TIMING_LABELS, timingChoices, timingLabel, type TimingField } from "@/lib/activity-timing-options";
import { ReminderChoices } from "./activity-timing-fields";
const sources = { discipline:"Disciplin",section:"Sektion",team:"Lag" };

function ChoiceListEditor({ field, values, onChange }: { field: TimingField; values: string[]; onChange: (values: string[]) => void }) {
  const [amount, setAmount] = useState(field === "duration" ? "90" : "1");
  const [unit, setUnit] = useState("d");
  const [midnight, setMidnight] = useState(false);
  const [error, setError] = useState("");
  function add() {
    try {
      if (!/^\d{1,6}$/.test(amount)) throw new Error("Ange ett heltal.");
      const value = field === "duration" ? `PT${Number(amount)}M` : `${field === "reminderRules" ? "deadline" : "start"}-${Number(amount)}${unit}${midnight ? "/d" : ""}`;
      normalizeTimingOptions({ [field]: [...values, value] });
      onChange([...values, value]); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ogiltig tid."); }
  }
  return <div className="timing-option-editor">
    <ul>{values.map((value, index) => <li key={value}><span>{timingLabel(field, value)}</span><button className="secondary" type="button" disabled={values.length === 1} aria-label={`Ta bort ${timingLabel(field, value)} från ${TIMING_LABELS[field]}`} onClick={() => onChange(values.filter((_, i) => i !== index))}>Ta bort</button></li>)}</ul>
    <div className="timing-choice-row"><label>Antal{field === "duration" ? " minuter" : ""}<input type="number" min={field === "duration" ? 1 : 0} max={field === "duration" ? 1440 : 527040} step={1} value={amount} onChange={event => setAmount(event.target.value)}/></label>
      {field !== "duration" ? <label>Enhet<select value={unit} onChange={event => setUnit(event.target.value)}><option value="d">Dagar innan</option><option value="h">Timmar innan</option><option value="m">Minuter innan</option></select></label> : null}
    </div>
    {field !== "duration" ? <label className="settings-checkbox"><input type="checkbox" checked={midnight} onChange={event => setMidnight(event.target.checked)}/>Vid dagens början</label> : null}
    <button className="secondary" type="button" disabled={values.length >= 32} onClick={add}>Lägg till valbar tid</button>{error ? <p className="auth-error" role="alert">{error}</p> : null}
  </div>;
}

export function DisciplineDefaultsFields({ initial, resolved }: { initial: DisciplineDefaultsPatch; resolved: ResolvedDisciplineDefaults }) {
  const [patch, setPatch] = useState(initial);
  function change(field: TimingField, value: string | string[] | null) { setPatch(current => ({ ...current, [field]: value })); }
  const [extraHours, setExtraHours] = useState("96");
  const settings = patch.capabilities?.targetTeamSize;
  const inherited = resolved.capabilities.targetTeamSize;
  function changeCapability(field: "notificationsEnabled" | "notificationHours", value: boolean | number[] | null) {
    setPatch(current => ({ ...current, capabilities: { ...current.capabilities, targetTeamSize: { ...current.capabilities?.targetTeamSize, [field]: value } } }));
  }
  const hours = settings?.notificationHours ?? inherited?.notificationHours ?? [];
  const options = Object.fromEntries(TIMING_FIELDS.map(field => [field, patch.options?.[field] ?? resolved.options[field]])) as ResolvedDisciplineDefaults["options"];
  return <>
    <input type="hidden" name="values" value={JSON.stringify(patch)}/>
    <div className="settings-fields">{TIMING_FIELDS.map(field => {
      const current = patch[field];
      return <div key={field}>{field === "reminderRules" ? <>
        <label className="settings-checkbox"><input type="checkbox" checked={current == null} onChange={event => change(field, event.target.checked ? null : [...resolved.rules.reminderRules])}/>Ärv påminnelser</label>
        {current != null ? <ReminderChoices values={current as string[]} options={options[field]} onChange={values => change(field, values)}/> : null}
      </> : <label>{TIMING_LABELS[field]}<select value={current as string ?? ""} onChange={event => change(field, event.target.value || null)}><option value="">Ärv från överordnad nivå</option>{timingChoices(field, options[field], [current as string ?? resolved.rules[field]]).map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label>}
      <small>Gäller: {field === "reminderRules" ? ((current ?? resolved.rules.reminderRules) as string[]).map(value => timingLabel(field, value)).join(", ") || "Inga påminnelser" : timingLabel(field, (current ?? resolved.rules[field]) as string)} · {current == null ? sources[resolved.sources[field].scope] : "Eget förval"}</small>
      </div>;
    })}</div>
    {inherited ? <fieldset><legend>Önskad matchtrupp · notifiering vid spelarbrist</legend>
      <p>Kontrollera hur många spelare som tackat ja och meddela lagets kallelseansvariga om truppen är för liten. Inställningen sparas på nya matcher.</p>
      <label>Aktivering<select value={settings?.notificationsEnabled == null ? "inherit" : String(settings.notificationsEnabled)} onChange={event => changeCapability("notificationsEnabled", event.target.value === "inherit" ? null : event.target.value === "true")}><option value="inherit">Ärv · {inherited.notificationsEnabled ? "På" : "Av"}</option><option value="true">På</option><option value="false">Av</option></select></label>
      <small>Ärvs från {sources[resolved.capabilitySources.notificationsEnabled!.scope]}.</small>
      <label className="settings-checkbox"><input type="checkbox" checked={settings?.notificationHours == null} onChange={event => changeCapability("notificationHours", event.target.checked ? null : [...inherited.notificationHours])}/>Ärv kontrolltider · {sources[resolved.capabilitySources.notificationHours!.scope]}</label>
      {settings?.notificationHours != null ? <>
        {[...new Set([24,48,72,168,...hours])].sort((a,b) => b-a).map(hour => <label className="settings-checkbox" key={hour}><input type="checkbox" checked={hours.includes(hour)} disabled={!hours.includes(hour) && hours.length >= 5} onChange={event => changeCapability("notificationHours", event.target.checked ? [...hours,hour] : hours.filter(value => value !== hour))}/>{hour % 24 === 0 ? `${hour/24} ${hour === 24 ? "dag" : "dagar"}` : `${hour} timmar`} före matchstart</label>)}
        <label>Egen kontrolltid i timmar<input type="number" min={1} max={720} step={1} value={extraHours} onChange={event => setExtraHours(event.target.value)}/></label>
        <button type="button" className="secondary" disabled={hours.length >= 5 || !Number.isInteger(Number(extraHours)) || Number(extraHours)<1 || Number(extraHours)>720 || hours.includes(Number(extraHours))} onClick={() => changeCapability("notificationHours", [...hours,Number(extraHours)])}>Lägg till kontrolltid</button>
      </> : <p>{hours.map(hour => hour % 24 === 0 ? `${hour/24} ${hour === 24 ? "dag" : "dagar"}` : `${hour} timmar`).join(", ")} före matchstart.</p>}
      {!hours.length ? <p>Inga kontrolltider valda. Ingen notifiering skickas.</p> : null}
    </fieldset> : null}
    <details><summary>Valbara tider</summary><p>Listorna ärvs per fält. Egna listor ersätter överordnad nivå. Ett tidigare valt värde behålls även om det tas bort ur listan. Påminnelser räknas före sista svarstid; övriga tider före start.</p>
      {TIMING_FIELDS.map(field => <fieldset key={field}><legend>{TIMING_LABELS[field]}</legend><label className="settings-checkbox"><input type="checkbox" checked={patch.options?.[field] == null} onChange={event => setPatch(current => ({ ...current, options: { ...current.options, [field]: event.target.checked ? null : [...resolved.options[field]] } }))}/>Ärv valbara tider · {sources[resolved.optionSources[field].scope]}</label>
        {patch.options?.[field] != null ? <ChoiceListEditor field={field} values={options[field]} onChange={values => setPatch(current => ({ ...current, options: { ...current.options, [field]: values } }))}/> : <p>{options[field].map(value => timingLabel(field, value)).join(", ")}</p>}
      </fieldset>)}
    </details>
  </>;
}
