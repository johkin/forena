"use client";
import { DutyEditor, DutyTypes, DutyDistribution } from "@/components/duty-management";
import { useEffect, useState } from "react";
import { createDutyIntervals, type Duty, type DutyCommand, type DutySchedule, type DutySlot } from "@/lib/activity-duty-schedule";
import { localActivityTime } from "@/lib/activity-time-rules";
import { FiveMinuteTimeField } from "@/components/five-minute-time-field";

function timing(duty: Duty, zone: string) {
 const format = (s: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: zone, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(s));
 return duty.startsAt && duty.endsAt ? `${format(duty.startsAt)}–${format(duty.endsAt)}` : duty.dueAt ? `Lämnas senast ${format(duty.dueAt)}` : "Ingen särskild tid";
}
export function ActivityDutySchedule({ activityId, startsAt, timeZone }: { activityId: string; startsAt: string; timeZone: string }) {
 const [schedule, setSchedule] = useState<DutySchedule | null>(null);
 const [error, setError] = useState("");
 const [busy, setBusy] = useState(false);
 const [preview, setPreview] = useState<{ command: DutyCommand; text: string } | null>(null);
 useEffect(() => {
   let cancelled = false;
   fetch(`/api/activities/${activityId}/duty-schedule`).then(async r => {
     if (r.status === 403) return null;
     const body = await r.json(); if (!r.ok) throw new Error(body.error); return body;
   }).then(body => { if (!cancelled) setSchedule(body); }).catch(e => { if (!cancelled) setError(e.message); });
   return () => { cancelled = true; };
 }, [activityId]);
 async function reload() {
   try { const r = await fetch(`/api/activities/${activityId}/duty-schedule`); const body = await r.json(); if (!r.ok) throw new Error(body.error); setSchedule(body); setError(""); }
   catch (e) { setError(e instanceof Error ? e.message : "Schemat kunde inte hämtas"); }
 }
 async function confirm() {
   if (!preview) return;
   setBusy(true); setError("");
   try { const r = await fetch(`/api/activities/${activityId}/duty-schedule`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(preview.command) }); const body = await r.json(); if (!r.ok) throw new Error(body.error); setSchedule(body); setPreview(null); }
   catch (e) { setError(e instanceof Error ? e.message : "Ändringen misslyckades"); }
   finally { setBusy(false); }
 }
 if (!schedule?.isWork) return error ? <p role="alert">{error}</p> : null;
 const allSlots = schedule.duties.flatMap(d => d.slots.map(s => ({ duty: d, slot: s })));
 const slotLabel = (id: string | null) => { const row = allSlots.find(x => x.slot.id === id); return row ? `${row.duty.name}, ${timing(row.duty, timeZone)}` : "Ingen plats"; };
 const propose = (command: DutyCommand, text: string) => setPreview({ command, text });
 return <section className="activity-invitation-add" aria-label="Arbetsuppgifter och schema"><h3>Arbetsuppgifter och schema</h3>
   <p className="overview-empty">Boka på spelarens namn. Familjen väljer vem som arbetar. En väntande ändring påverkar inte den nuvarande tilldelningen.</p>
   <button type="button" className="link-button" disabled={busy} onClick={() => void reload()}>Uppdatera schemat</button>
   {error && <p role="alert">{error}</p>}
   {preview && <div className="duty-row" role="region" aria-label="Bekräfta ändring"><h4>Bekräfta ändring</h4><p>{preview.text}</p><div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setPreview(null)}>Avbryt</button><button type="button" className="primary" disabled={busy} onClick={() => void confirm()}>{busy ? "Sparar…" : "Bekräfta"}</button></div></div>}
   <fieldset disabled={busy || Boolean(preview)} className="duty-controls">
   {schedule.duties.map(d => <div className="duty-row" key={d.id}><h4>{d.name} · {d.slots.filter(s => !s.occupied).length} lediga</h4><p>{timing(d,timeZone)}</p>{d.instructions && <p className="duty-instructions">{d.instructions}</p>}
   {schedule.canManage && <DutyEditor key={`${d.id}:${d.revision}`} duty={d} timeZone={timeZone} propose={propose} />}
   {d.slots.map((slot, index) => <SlotRow key={`${slot.id}:${slot.revision}`} slot={slot} index={index} duty={d} schedule={schedule} choices={allSlots.filter(x => x.slot.id !== slot.id && !x.slot.completedAt)} timeZone={timeZone} propose={propose} />)}</div>)}
   {!schedule.duties.length && <p>Inga arbetsuppgifter är upplagda ännu.</p>}
   {schedule.requests.length > 0 && <details open><summary>Ändringsförslag ({schedule.requests.filter(r => r.status === "pending").length} väntar)</summary>{schedule.requests.map(r => <div className="duty-row" key={r.id}><strong>{r.sourceSlotId ? r.targetSlotId ? "Flytt eller byte" : "Önskar ersättare" : "Bokningsförfrågan"}</strong><p>{slotLabel(r.sourceSlotId)} → {slotLabel(r.targetSlotId)}</p><p>{{ pending: "Väntar på godkännande", applied: "Genomförd", rejected: "Avböjd", withdrawn: "Återtagen", expired: "Inaktuell eller utgången" }[r.status]}</p>{r.status === "pending" && <><p>{r.counterpartApproved ? "Berörd familj: klart" : "Väntar på den andra familjen"}{r.managerApproved ? " · Ledare: godkänt" : ""}</p><div className="modal-actions">{r.canApprove && <><button type="button" className="primary" onClick={() => propose({ op: "approve", requestId: r.id }, "Godkänn förslaget. Ändringen genomförs när alla nödvändiga godkännanden finns.")}>Godkänn</button><button type="button" className="secondary" onClick={() => propose({ op: "reject", requestId: r.id }, "Avböj förslaget. Nuvarande tilldelning behålls.")}>Avböj</button></>}{r.mine && <button type="button" className="secondary" onClick={() => propose({ op: "withdraw", requestId: r.id }, "Återta förslaget. Nuvarande tilldelning behålls.")}>Återta</button>}</div></>}</div>)}</details>}
   {schedule.canManage && <><DutyDistribution key={JSON.stringify(schedule.duties)} activityId={activityId} timeZone={timeZone} schedule={schedule} propose={propose} /><DutyTypes schedule={schedule} propose={propose} /><DutyHistory activityId={activityId} people={schedule.people} timeZone={timeZone} /><DutyCreator key={JSON.stringify(schedule.types)} activityId={activityId} startsAt={startsAt} timeZone={timeZone} propose={propose} /><DutySettings key={`${schedule.claimRequiresApproval}:${schedule.changeRequiresApproval}:${schedule.selfServiceUntil}`} schedule={schedule} timeZone={timeZone} propose={propose} /></>}
   </fieldset>
 </section>;
}
function SlotRow({ slot, index, duty, schedule, choices, timeZone, propose }: { slot: DutySlot; index: number; duty: Duty; schedule: DutySchedule; choices: { slot: DutySlot; duty: Duty }[]; timeZone: string; propose: (c: DutyCommand, text: string) => void }) {
 const [person, setPerson] = useState(slot.personId ?? schedule.people[0]?.id ?? "");
 const [target, setTarget] = useState("");
 const [openedAt] = useState(() => Date.now());
 const closed = openedAt >= new Date(schedule.selfServiceUntil).getTime();
 const title = `${duty.name} · ${timing(duty,timeZone)}`;
 return <div className="duty-slot"><strong>Plats {index+1}: {slot.personName ?? (slot.occupied ? "Bokad av annan familj" : "Ledig")}{slot.completedAt ? " · Genomförd" : ""}</strong>
   {!slot.completedAt && (!slot.occupied || schedule.canManage) && <div className="participant-selection"><label>Spelare<select value={person} onChange={e => setPerson(e.target.value)}><option value="">Välj spelare</option>{schedule.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   {!slot.occupied && <button type="button" className="primary" disabled={!person || closed} onClick={() => propose({ op: "claim", personId: person, targetSlotId: slot.id }, `Ta platsen: ${title}, för ${schedule.people.find(p => p.id===person)?.name}. ${schedule.claimRequiresApproval ? "Bokningen kräver ledarens godkännande." : "Platsen bokas direkt om den fortfarande är ledig."}`)}>Ta platsen</button>}
   {schedule.canManage && <><button type="button" className="secondary" disabled={!person} onClick={() => propose({ op: "assign", slotId: slot.id, personId: person, revision: slot.revision }, `Tilldela ${title} till ${schedule.people.find(p => p.id===person)?.name}.`)}>Tilldela</button>{slot.occupied && <button type="button" className="secondary" onClick={() => propose({ op: "assign", slotId: slot.id, personId: null, revision: slot.revision }, `Frigör platsen: ${title}.`)}>Frigör</button>}</>}
   </div>}
   {slot.mine && slot.personId && !slot.completedAt && <div className="participant-selection"><label>Föreslå ändring<select value={target} onChange={e => setTarget(e.target.value)}><option value="">Be om ersättare</option>{choices.filter(x => x.slot.personId !== slot.personId).map(x => <option key={x.slot.id} value={x.slot.id}>{x.duty.name} · {timing(x.duty,timeZone)} · {x.slot.occupied ? "Byte med annan familj" : "Ledig plats"}</option>)}</select></label><button type="button" className="secondary" disabled={closed} onClick={() => propose({ op: "propose", personId: slot.personId!, sourceSlotId: slot.id, targetSlotId: target || null }, `Föreslå ändring för ${title}. Din nuvarande tilldelning gäller tills ändringen är godkänd.`)}>Föreslå ändring</button></div>}
   {closed && slot.mine && <small>Självservice är stängd. Kontakta ledaren för ändringar.</small>}
   {schedule.canManage && slot.occupied && <button type="button" className="link-button" onClick={() => propose({ op: "complete", slotId: slot.id, revision: slot.revision, completed: !slot.completedAt }, slot.completedAt ? "Ta bort genomförandemarkeringen?" : `Registrera ${title} som genomfört?`)}>{slot.completedAt ? "Ångra genomförande" : "Markera genomfört"}</button>}
 </div>;
}
function DutySettings({ schedule, timeZone, propose }: { schedule: DutySchedule; timeZone: string; propose: (c: DutyCommand, text: string) => void }) {
 const [date, setDate] = useState(new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(schedule.selfServiceUntil)));
 const [time, setTime] = useState(new Intl.DateTimeFormat("sv-SE", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(schedule.selfServiceUntil)));
 const [claim, setClaim] = useState(schedule.claimRequiresApproval);
 const [change, setChange] = useState(schedule.changeRequiresApproval);
 return <details><summary>Regler för självservice</summary><label className="duty-completed"><input type="checkbox" checked={claim} onChange={e => setClaim(e.target.checked)} />Ledaren godkänner bokningar</label><label className="duty-completed"><input type="checkbox" checked={change} onChange={e => setChange(e.target.checked)} />Ledaren godkänner flytt och byte</label><div className="participant-selection"><label>Självservice till datum<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label><FiveMinuteTimeField name="self-service-until" defaultValue={time} label="Klockslag" onChange={setTime} /></div><p>Självservice stänger senast när aktiviteten börjar. Begäran om ersättare kräver alltid ledargodkännande.</p><button type="button" className="secondary" onClick={() => propose({ op: "settings", claimRequiresApproval: claim, changeRequiresApproval: change, selfServiceUntil: localActivityTime(date, time, timeZone).toISOString() }, "Spara reglerna för självservice? Reglerna gäller också väntande förslag när de behandlas.")}>Spara regler</button></details>;
}
function DutyCreator({ activityId, startsAt, timeZone, propose }: { activityId: string; startsAt: string; timeZone: string; propose: (c: DutyCommand, text: string) => void }) {
 const [types, setTypes] = useState<{id:string;name:string}[]>([]);
 const [type, setType] = useState("");
 const [newType, setNewType] = useState("");
 const [kind, setKind] = useState<"interval" | "deadline" | "none">("interval");
 const [date, setDate] = useState(new Intl.DateTimeFormat("sv-SE", {timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(startsAt)));
 const [start, setStart] = useState("08:00"); const [end, setEnd] = useState("18:00");
 const [minutes,setMinutes] = useState(120); const [places,setPlaces] = useState(3);
 const [instructions,setInstructions] = useState(""); const [opening,setOpening] = useState(""); const [closing,setClosing] = useState("");
 const [error,setError] = useState(""); const [busy,setBusy] = useState(false);
 useEffect(() => { let active=true; fetch(`/api/activities/${activityId}/duties`).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error);return b;}).then(b=>{if(active)setTypes(b.duties);}).catch(()=>{if(active)setError("Uppgiftstyper kunde inte hämtas");});return()=>{active=false;}; },[activityId]);
 async function addType(){setBusy(true);setError("");try{const r=await fetch(`/api/activities/${activityId}/duties`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:newType})});const b=await r.json();if(!r.ok)throw new Error(b.error);setTypes(t=>[...t,b.duty]);setType(b.duty.id);setNewType("");}catch(e){setError(e instanceof Error?e.message:"Kunde inte skapa uppgiftstyp");}finally{setBusy(false);}}
 function preview(){setError("");try{const duties=kind==="interval"?createDutyIntervals(date,start,end,timeZone,minutes,places,instructions,opening,closing):[{timingKind:kind,startsAt:null,endsAt:null,dueAt:kind==="deadline"?localActivityTime(date,start,timeZone).toISOString():null,places,instructions}];propose({op:"create",dutyTypeId:type,duties},`Skapa ${duties.length} uppgiftstillfällen för ${types.find(t=>t.id===type)?.name}, med ${places} lediga platser per tillfälle. ${kind==="interval"?`${date} ${start}–${end}, ${minutes} minuter per pass.`:kind==="deadline"?`Lämnas senast ${date} ${start}.`:"Ingen särskild tid."}`);}catch(e){setError(e instanceof Error?e.message:"Kontrollera uppgifterna");}}
 return <details><summary>Skapa uppgifter och lediga platser</summary><div className="participant-selection"><label>Uppgift<select value={type} onChange={e=>setType(e.target.value)}><option value="">Välj uppgift</option>{types.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Ny uppgiftstyp<input maxLength={80} value={newType} onChange={e=>setNewType(e.target.value)} placeholder="Cafébemanning eller bakning" /></label><button type="button" className="secondary" disabled={!newType.trim()||busy} onClick={()=>void addType()}>Lägg till typ</button></div>
 <div className="participant-selection"><label>Tid<select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="interval">Bemanningspass</option><option value="deadline">Deadline för leverans</option><option value="none">Ingen särskild tid</option></select></label><label>Platser per tillfälle<input type="number" min={1} max={50} value={places} onChange={e=>setPlaces(Number(e.target.value))}/></label></div>
 {kind!=="none"&&<div className="participant-selection"><label>Datum<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><FiveMinuteTimeField name="duty-start" defaultValue={start} label={kind==="deadline"?"Lämnas senast":"Från"} onChange={setStart}/>{kind==="interval"&&<><FiveMinuteTimeField name="duty-end" defaultValue={end} label="Till" onChange={setEnd}/><label>Minuter per pass<input type="number" min={5} step={5} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label></>}</div>}
 <label>Instruktioner<textarea maxLength={2000} value={instructions} onChange={e=>setInstructions(e.target.value)}/></label>{kind==="interval"&&<><label>Extra instruktion för första passet<textarea maxLength={500} value={opening} onChange={e=>setOpening(e.target.value)}/></label><label>Extra instruktion för sista passet<textarea maxLength={500} value={closing} onChange={e=>setClosing(e.target.value)}/></label></>}
 {error&&<p role="alert">{error}</p>}<button type="button" className="primary" disabled={!type||busy} onClick={preview}>Granska schema</button></details>;
}

function DutyHistory({ activityId, people, timeZone }: { activityId: string; people: DutySchedule["people"]; timeZone: string }) {
 const [person, setPerson] = useState("");
 const [rows, setRows] = useState<{ activity_title: string; starts_at: string; duty_name: string | null; completed_at: string | null }[]>([]);
 const [notice, setNotice] = useState("");
 const [busy, setBusy] = useState(false);
 async function load() {
   setBusy(true); setNotice(""); setRows([]);
   try { const r = await fetch(`/api/activities/${activityId}/duties?personId=${person}`); const body = await r.json(); if (!r.ok) throw new Error(body.error); setRows(body.history); if (!body.history.length) setNotice("Inga tidigare uppgifter registrerade."); }
   catch (e) { setNotice(e instanceof Error ? e.message : "Historiken kunde inte hämtas"); }
   finally { setBusy(false); }
 }
 return <details><summary>Tidigare arbetsuppgifter</summary><div className="participant-selection"><label>Spelare<select value={person} disabled={busy} onChange={e => { setPerson(e.target.value); setRows([]); setNotice(""); }}><option value="">Välj spelare</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button type="button" className="secondary" disabled={!person || busy} onClick={() => void load()}>Visa historik</button></div><p>Högst 20 påbörjade uppgifter inom laget.</p>{rows.length > 0 && <ul>{rows.map((r,i) => <li key={i}>{new Intl.DateTimeFormat("sv-SE", { timeZone, dateStyle: "short" }).format(new Date(r.starts_at))} · {r.activity_title} · {r.duty_name} · {r.completed_at ? "Genomfört" : "Inte registrerat som genomfört"}</li>)}</ul>}{notice && <p role="status">{notice}</p>}</details>;
}
