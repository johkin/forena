"use client";
import { useActionState, useRef, useState } from "react";
import { clubSlug, type ClubSetupState } from "@/lib/club-administration";

import { ClubSlugField } from "./club-slug-field";
import { TimeZoneSelect } from "./time-zone-select";

type Props = { disciplines: { id: string; name: string }[]; managed?: boolean; action: (state: ClubSetupState, form: FormData) => Promise<ClubSetupState> };
/** Review the initial structure before the atomic create command. */
export function ClubOnboarding({ disciplines, managed = false, action }: Props) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState({ organizationName: "", organizationSlug: "", sectionName: "", disciplineId: "", teamName: "", season: String(new Date().getFullYear()), timeZone: "Europe/Stockholm" });
  const [manualSlug, setManualSlug] = useState(false);
  const [addTeam, setAddTeam] = useState(false);
  const [state, submit, pending] = useActionState(action, {});
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  function move(next: number) { setStep(next); requestAnimationFrame(() => heading.current?.focus()); }
  function advance() {
    const inputs = form.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>(`fieldset[data-step="${step}"] input, fieldset[data-step="${step}"] select`);
    for (const input of inputs ?? []) if (!input.checkValidity()) { input.reportValidity(); return; }
    move(step + 1);
  }
  const change = (key: keyof typeof values, value: string) => setValues(current => ({ ...current, [key]: value }));
  return <form ref={form} action={submit} className="application-form club-onboarding" onSubmit={event => { if (step < 2) { event.preventDefault(); advance(); } }}>
    <ol className="onboarding-steps" aria-label="Steg i klubbskapandet">{["Klubb", "Första sektionen", "Granska"].map((name, i) => <li key={name} aria-current={step === i ? "step" : undefined}>{i + 1}. {name}</li>)}</ol>
    <h2 ref={heading} tabIndex={-1}>{["Klubbens uppgifter", "Första sektionen", "Granska och skapa"][step]}</h2>
    <fieldset data-step="0" hidden={step !== 0} disabled={pending}>
      <legend className="sr-only">Klubbens uppgifter</legend>
      <label>Klubbens namn<input name="organizationName" value={values.organizationName} maxLength={120} required onChange={event => { const name = event.target.value; setValues(current => ({ ...current, organizationName: name, organizationSlug: manualSlug ? current.organizationSlug : clubSlug(name) })); }}/></label>
      <ClubSlugField name="organizationSlug" value={values.organizationSlug} onChange={value => { setManualSlug(true); change("organizationSlug", value); }}/>
      <TimeZoneSelect value={values.timeZone} onChange={value => change("timeZone", value)}/>
    </fieldset>
    <fieldset data-step="1" hidden={step !== 1} disabled={pending}>
      <legend className="sr-only">Första sektionen</legend><p>Alla lag hör till en sektion. Med en enda sektion visas inte en extra sektionsnivå i den vanliga navigationen.</p>
      <label>Disciplin<select name="disciplineId" value={values.disciplineId} required onChange={event => { const id = event.target.value; setValues(current => ({ ...current, disciplineId: id, sectionName: current.sectionName || disciplines.find(d => d.id === id)?.name || "" })); }}><option value="">Välj disciplin</option>{disciplines.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label>Sektionens namn<input name="sectionName" value={values.sectionName} maxLength={120} required onChange={event => change("sectionName", event.target.value)}/></label>
      <label className="onboarding-checkbox"><input type="checkbox" name="addTeam" checked={addTeam} onChange={event => setAddTeam(event.target.checked)}/>Lägg till ett första lag</label>
      {addTeam ? <><label>Lagets namn<input name="teamName" value={values.teamName} maxLength={120} required onChange={event => change("teamName", event.target.value)}/></label><label>Säsong<input name="season" value={values.season} maxLength={40} onChange={event => change("season", event.target.value)}/></label></> : null}
    </fieldset>
    {step === 2 ? <div className="onboarding-review"><dl><div><dt>Klubb</dt><dd>{values.organizationName}</dd></div><div><dt>Adress</dt><dd>/o/{values.organizationSlug}</dd></div><div><dt>Tidszon</dt><dd>{values.timeZone}</dd></div><div><dt>Sektion</dt><dd>{values.sectionName}</dd></div><div><dt>Disciplin</dt><dd>{disciplines.find(d => d.id === values.disciplineId)?.name}</dd></div>{addTeam ? <div><dt>Första laget</dt><dd>{values.teamName} · {values.season}</dd></div> : null}</dl><p>{managed ? "Du administrerar klubbens struktur från systemadministrationen och blir inte automatiskt medlem i klubben." : "Du blir ägare för klubben. Du kan lägga till fler sektioner senare."}</p><p>Ingen aktivitet eller kallelse skapas.</p></div> : null}
    {state.error ? <p role="alert" className="auth-error">{state.error}</p> : null}
    <div className="modal-actions">{step > 0 ? <button type="button" className="secondary" disabled={pending} onClick={() => move(step - 1)}>Tillbaka</button> : null}{step < 2 ? <button type="button" className="primary" onClick={advance}>Nästa</button> : <button type="submit" className="primary" disabled={pending}>{pending ? "Skapar…" : "Skapa klubb"}</button>}</div>
  </form>;
}
