"use client";
import { DutyAssignmentPreview } from "@/components/duty-assignment-preview";
import { formatDutyTiming as timing } from "@/lib/duty-presentation";
import { DutySeriesForm, DutySeriesEditor } from "@/components/duty-series-form";
import { DutyEditor, DutyTypes, DutyDistribution } from "@/components/duty-management";
import { useEffect, useRef, useState } from "react";
import { expandDutySeries, type Duty, type DutyCommand, type DutySchedule, type DutySlot } from "@/lib/activity-duty-schedule";
import { localActivityTime } from "@/lib/activity-time-rules";
import { DateTimeRangeFields } from "@/components/date-time-range-fields";

export function ActivityDutySchedule({ activityId, startsAt, endsAt, timeZone, context, readOnly = false }: { activityId: string; startsAt: string; endsAt: string; timeZone: string; context?: { title: string; location?: string; teamName?: string; organizationName?: string }; readOnly?: boolean }) {
 const [schedule, setSchedule] = useState<DutySchedule | null>(null);
 const [error, setError] = useState("");
 const [busy, setBusy] = useState(false);
 const [refreshing, setRefreshing] = useState(false);
 const [refreshNotice, setRefreshNotice] = useState("");
 const [editing, setEditing] = useState(false);
 const [selected, setSelected] = useState<string[]>([]);
 const previewRef = useRef<HTMLDivElement>(null);
 const [preview, setPreview] = useState<{ command: DutyCommand; text: string; rows: string[] } | null>(null);
 useEffect(() => { if (preview) { previewRef.current?.focus({ preventScroll: true }); previewRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); } }, [preview]);
 useEffect(() => {
   let cancelled = false;
   fetch(`/api/activities/${activityId}/duty-schedule`).then(async r => {
     if (r.status === 403) return null;
     const body = await r.json(); if (!r.ok) throw new Error(body.error); return body;
   }).then(body => { if (!cancelled) setSchedule(body); }).catch(e => { if (!cancelled) setError(e.message); });
   return () => { cancelled = true; };
 }, [activityId]);
 async function reload() {
   setRefreshing(true); setRefreshNotice("");
   try { const r = await fetch(`/api/activities/${activityId}/duty-schedule`); const body = await r.json(); if (!r.ok) throw new Error(body.error); setSchedule(body); setSelected([]); setError(""); setRefreshNotice("Senaste schemat har hämtats."); }
   catch (e) { setError(e instanceof Error ? e.message : "Schemat kunde inte hämtas"); }
   finally { setRefreshing(false); }
 }
 async function confirm() {
   if (!preview || readOnly) return;
   setBusy(true); setError(""); setRefreshNotice("");
   try { const r = await fetch(`/api/activities/${activityId}/duty-schedule`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(preview.command) }); const body = await r.json(); if (!r.ok) throw new Error(body.error); setSchedule(body); setSelected([]); setPreview(null); setRefreshNotice("Ändringen är sparad i schemat."); }
   catch (e) { setError(e instanceof Error ? e.message : "Ändringen misslyckades"); }
   finally { setBusy(false); }
 }
 if (!schedule || !(schedule.supportsDuties ?? schedule.isWork) || (!schedule.canManage && !schedule.duties.length)) return error ? <p role="alert">{error}</p> : null;
 const allSlots = schedule.duties.flatMap(d => d.slots.map(s => ({ duty: d, slot: s })));
 const slotLabel = (id: string | null) => { const row = allSlots.find(x => x.slot.id === id); return row ? `${row.duty.name}, ${timing(row.duty, timeZone)}` : "Ingen plats"; };
 const selectedDuties = schedule.duties.filter(d => selected.includes(d.id) && !d.slots.some(s => s.completedAt));
 const editableDuties = schedule.duties.filter(d => !d.slots.some(s => s.completedAt));
 const propose = (command: DutyCommand, text: string) => {
   if (readOnly) return;
   setRefreshNotice("");
   setError("");
   const rows = (command.op === "create_series" || command.op === "edit_series") ? expandDutySeries(command.definition).map((d, index) => {
       const previous = command.op === "edit_series" ? schedule.duties.find(duty => duty.seriesId === command.seriesId && duty.position === index + 1) : undefined;
       const bookings = previous?.slots.filter(slot => slot.occupied).map(slot => slot.personName ?? "Bokad plats") ?? [];
       return `Pass ${index + 1}: ${timing(d, timeZone)} · ${d.places} platser${d.instructions ? ` · ${d.instructions}` : ""}${bookings.length ? ` · Bokningar: ${bookings.join(", ")} (tidigare ${timing(previous!, timeZone)})` : ""}`;
     }).concat(command.op === "edit_series" ? schedule.duties.filter(d => d.seriesId === command.seriesId && (d.position ?? 1) > expandDutySeries(command.definition).length).map(d => `Pass ${d.position}: ${timing(d, timeZone)} tas bort (${d.slots.length} lediga platser).`) : []) : command.op === "cancel_series" ? schedule.duties.filter(d => d.seriesId === command.seriesId).map(d => `${d.name} · ${timing(d, timeZone)} · ${d.slots.filter(s => s.occupied).length} bokade platser frigörs`)
     : command.op === "create" ? command.duties.map(d => `${timing(d, timeZone)} · ${d.places} platser${d.instructions ? ` · ${d.instructions}` : ""}`)
     : command.op === "cancel_duties" ? command.duties.map(item => {
       const duty = schedule.duties.find(d => d.id === item.dutyId)!;
       return `${duty.name} · ${timing(duty, timeZone)} · ${duty.slots.filter(s => s.occupied).length} bokade platser frigörs`;
     }) : [];
   setPreview({ command, text, rows });
 };
 return <section className="activity-invitation-add duty-schedule" aria-label="Arbetsuppgifter och schema"><div className="workflow-section-heading"><div><p className="eyebrow">Bokning &amp; bemanning</p><h3>Arbetsuppgifter och schema</h3></div><span className="badge">{schedule.duties.length}</span></div>
   <p className="overview-empty">{readOnly ? "Registrerade arbetsuppgifter och bokningar." : "Boka på spelarens namn. Familjen väljer vem som arbetar. En väntande ändring påverkar inte den nuvarande tilldelningen."}</p>
   <button type="button" className="link-button" disabled={busy || refreshing || Boolean(preview)} onClick={() => void reload()}>{refreshing ? "Hämtar schema…" : "Hämta senaste schemat"}</button>
   <p role="status" aria-live="polite">{refreshNotice}</p>
   {error && <p role="alert">{error}</p>}
   {!readOnly && preview && <div ref={previewRef} tabIndex={-1} className="duty-row duty-review" role="region" aria-label="Bekräfta ändring"><h4>Förhandsgranskning – inte sparad ännu</h4><p>{preview.text}</p>{preview.command.op === "assign_batch" && <DutyAssignmentPreview assignments={preview.command.assignments} schedule={schedule} timeZone={timeZone} />}{preview.rows.length > 0 && <ol>{preview.rows.map((row, index) => <li key={index}>{row}</li>)}</ol>}<div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={() => { setPreview(null); setError(""); }}>Avbryt</button><button type="button" className="primary" disabled={busy} onClick={() => void confirm()}>{busy ? "Sparar…" : (preview.command.op === "create" || preview.command.op === "create_series") ? "Spara uppgifter" : "Bekräfta"}</button></div></div>}
   {allSlots.length > 0 && <div className="duty-capacity"><div><strong>{allSlots.filter(item => item.slot.occupied).length} av {allSlots.length} platser bokade</strong><span>{allSlots.filter(item => !item.slot.occupied).length} lediga</span></div><progress value={allSlots.filter(item => item.slot.occupied).length} max={allSlots.length} aria-label="Bokade platser i schemat" /></div>}
   <fieldset disabled={busy || refreshing || Boolean(preview)} className="duty-controls">
   {!readOnly && schedule.canManage && <>
     <button type="button" className="secondary" aria-pressed={editing} onClick={() => { setEditing(value => !value); setSelected([]); }}>{editing ? "Avsluta redigering" : "Redigera arbetsuppgifter"}</button>
     {editing && <div className="duty-edit-overview"><div className="duty-activity-context"><p className="eyebrow">Kopplad till aktivitet</p>{context ? <><h4>{context.title}</h4><p>{[context.organizationName,context.teamName].filter(Boolean).join(" · ")}</p></> : null}<p>{new Intl.DateTimeFormat("sv-SE",{timeZone,dateStyle:"medium",timeStyle:"short"}).format(new Date(startsAt))} – {new Intl.DateTimeFormat("sv-SE",{timeZone,dateStyle:"medium",timeStyle:"short"}).format(new Date(endsAt))}</p>{context?.location ? <p>{context.location}</p> : null}</div><p>Ändra uppgifter här. Varje ändring granskas och sparas separat. Genomförda uppgifter kan inte tas bort.</p><div className="modal-actions">
       <button type="button" className="secondary" disabled={!editableDuties.length} onClick={() => setSelected(editableDuties.slice(0, 100).map(d => d.id))}>Markera alla</button>
       <button type="button" className="secondary" disabled={!selected.length} onClick={() => setSelected([])}>Avmarkera alla</button>
       <button type="button" className="danger" disabled={!selectedDuties.length} onClick={() => propose({ op: "cancel_duties", duties: selectedDuties.map(d => ({ dutyId: d.id, revision: d.revision })) }, `Ta bort ${selectedDuties.length} markerade uppgifter? Bokade platser frigörs och berörda familjer notifieras. Väntande ändringsförslag stängs. Historiken behålls.`)}>Ta bort markerade ({selectedDuties.length})</button>
     </div>{editableDuties.length > 100 && <p>Högst 100 uppgifter kan markeras åt gången.</p>}</div>}
   </>}
   {!readOnly && schedule.canManage && editing && <DutyCreator key={JSON.stringify(schedule.types)} activityId={activityId} startsAt={startsAt} endsAt={endsAt} timeZone={timeZone} schedule={schedule} propose={propose} />}
   {!readOnly && schedule.canManage && editing && (schedule.series ?? []).map(series => <div className="duty-row" key={series.id}><h4>{series.name} · {schedule.duties.filter(d => d.seriesId === series.id).length} pass i uppgiftsserien</h4><DutySeriesEditor key={`${series.id}:${series.revision}`} series={series} duties={schedule.duties.filter(d => d.seriesId === series.id)} startsAt={startsAt} endsAt={endsAt} timeZone={timeZone} propose={propose} /></div>)}
   {schedule.duties.map(d => <div className="duty-row duty-card" data-timing={d.timingKind} key={d.id}><div className="duty-card-heading"><div><p className="eyebrow">{d.name}</p><h4>{timing(d,timeZone)}</h4></div><span className="status" data-state={d.slots.some(s => !s.occupied) ? "available" : "full"}>{d.slots.filter(s => !s.occupied).length} lediga</span></div>{d.instructions && <p className="duty-instructions">{d.instructions}</p>}
   {!readOnly && schedule.canManage && editing && <label className="duty-completed"><input type="checkbox" checked={selected.includes(d.id)} disabled={d.slots.some(s => Boolean(s.completedAt)) || (!selected.includes(d.id) && selected.length >= 100)} onChange={e => setSelected(ids => e.target.checked ? [...ids, d.id] : ids.filter(id => id !== d.id))} />Markera {d.name}, {timing(d, timeZone)}{d.slots.some(s => s.completedAt) ? " (genomförd – låst)" : ""}</label>}
   {!readOnly && schedule.canManage && editing && <DutyEditor key={`${d.id}:${d.revision}`} duty={d} timeZone={timeZone} startsAt={startsAt} endsAt={endsAt} propose={propose} />}
   {d.slots.map((slot, index) => <SlotRow key={`${slot.id}:${slot.revision}`} slot={slot} index={index} duty={d} schedule={schedule} choices={allSlots.filter(x => x.slot.id !== slot.id && !x.slot.completedAt)} timeZone={timeZone} readOnly={readOnly} propose={propose} />)}</div>)}
   {!schedule.duties.length && <p>Inga arbetsuppgifter är upplagda ännu.</p>}
   {schedule.requests.length > 0 && <details open><summary>Ändringsförslag ({schedule.requests.filter(r => r.status === "pending").length} väntar)</summary>{schedule.requests.map(r => <div className="duty-row" key={r.id}><strong>{r.sourceSlotId ? r.targetSlotId ? "Flytt eller byte" : "Önskar ersättare" : "Bokningsförfrågan"}</strong><p>{slotLabel(r.sourceSlotId)} → {slotLabel(r.targetSlotId)}</p><p>{{ pending: "Väntar på godkännande", applied: "Genomförd", rejected: "Avböjd", withdrawn: "Återtagen", expired: "Inaktuell eller utgången" }[r.status]}</p>{r.status === "pending" && <><p>{r.counterpartApproved ? "Berörd familj: klart" : "Väntar på den andra familjen"}{r.managerApproved ? " · Ledare: godkänt" : ""}</p><div className="modal-actions">{!readOnly && r.canApprove && <><button type="button" className="primary" onClick={() => propose({ op: "approve", requestId: r.id }, "Godkänn förslaget. Ändringen genomförs när alla nödvändiga godkännanden finns.")}>Godkänn</button><button type="button" className="secondary" onClick={() => propose({ op: "reject", requestId: r.id }, "Avböj förslaget. Nuvarande tilldelning behålls.")}>Avböj</button></>}{!readOnly && r.mine && <button type="button" className="secondary" onClick={() => propose({ op: "withdraw", requestId: r.id }, "Återta förslaget. Nuvarande tilldelning behålls.")}>Återta</button>}</div></>}</div>)}</details>}
   {!readOnly && schedule.canManage && <>{allSlots.some(({ slot }) => !slot.occupied && !slot.completedAt) && <DutyDistribution key={JSON.stringify(schedule.duties)} activityId={activityId} timeZone={timeZone} schedule={schedule} propose={propose}><DutyHistory activityId={activityId} people={schedule.people} timeZone={timeZone} /></DutyDistribution>}{editing && schedule.duties.length > 0 && <DutySettings key={`${schedule.claimRequiresApproval}:${schedule.changeRequiresApproval}:${schedule.selfServiceUntil}`} schedule={schedule} timeZone={timeZone} propose={propose} />}</>}
   </fieldset>
 </section>;
}
function SlotRow({ slot, index, duty, schedule, choices, timeZone, readOnly, propose }: { readOnly: boolean; slot: DutySlot; index: number; duty: Duty; schedule: DutySchedule; choices: { slot: DutySlot; duty: Duty }[]; timeZone: string; propose: (c: DutyCommand, text: string) => void }) {
 const [chosenPerson, setPerson] = useState(slot.personId ?? schedule.people[0]?.id ?? "");
 const person = schedule.people.length === 1 ? schedule.people[0].id : schedule.people.some(p => p.id === chosenPerson) ? chosenPerson : "";
 const [target, setTarget] = useState("");
 const [openedAt] = useState(() => Date.now());
 const closed = openedAt >= new Date(schedule.selfServiceUntil).getTime();
 const title = `${duty.name} · ${timing(duty,timeZone)}`;
 return <div className="duty-slot" data-state={slot.mine ? "mine" : slot.occupied ? "booked" : "available"}><div className="duty-slot-heading"><span className="duty-slot-number" aria-hidden="true">{index+1}</span><strong>Plats {index+1}: {slot.personName ?? (slot.occupied ? "Bokad av annan familj" : "Ledig")}{slot.completedAt ? " · Genomförd" : ""}</strong>{slot.mine && <span className="status accepted">Ditt pass</span>}</div>
   {!readOnly && !slot.completedAt && (!slot.occupied || schedule.canManage) && <div className="participant-selection">{schedule.people.length === 1 ? <span>Spelare: {schedule.people[0].name}</span> : <label>Spelare<select value={person} onChange={e => setPerson(e.target.value)}><option value="">Välj spelare</option>{schedule.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
   {!slot.occupied && <button type="button" className="primary" disabled={!person || closed} onClick={() => propose({ op: "claim", personId: person, targetSlotId: slot.id }, `Ta platsen: ${title}, för ${schedule.people.find(p => p.id===person)?.name}. ${schedule.claimRequiresApproval ? "Bokningen kräver ledarens godkännande." : "Platsen bokas direkt om den fortfarande är ledig."}`)}>Ta platsen</button>}
   {!readOnly && schedule.canManage && <><button type="button" className="secondary" disabled={!person} onClick={() => propose({ op: "assign", slotId: slot.id, personId: person, revision: slot.revision }, `Tilldela ${title} till ${schedule.people.find(p => p.id===person)?.name}.`)}>Tilldela</button>{slot.occupied && <button type="button" className="secondary" onClick={() => propose({ op: "assign", slotId: slot.id, personId: null, revision: slot.revision }, `Frigör platsen: ${title}.`)}>Frigör</button>}</>}
   </div>}
   {!readOnly && slot.mine && slot.personId && !slot.completedAt && <details className="duty-change"><summary>Hantera ditt pass</summary><div className="participant-selection"><label>Föreslå ändring<select value={target} onChange={e => setTarget(e.target.value)}><option value="">Be om ersättare</option>{choices.filter(x => x.slot.personId !== slot.personId).map(x => <option key={x.slot.id} value={x.slot.id}>{x.duty.name} · {timing(x.duty,timeZone)} · {x.slot.occupied ? "Byte med annan familj" : "Ledig plats"}</option>)}</select></label><button type="button" className="secondary" disabled={closed} onClick={() => propose({ op: "propose", personId: slot.personId!, sourceSlotId: slot.id, targetSlotId: target || null }, `Föreslå ändring för ${title}. Din nuvarande tilldelning gäller tills ändringen är godkänd.`)}>Föreslå ändring</button></div></details>}
   {!readOnly && closed && slot.mine && <small>Självservice är stängd. Kontakta ledaren för ändringar.</small>}
   {!readOnly && schedule.canManage && slot.occupied && <button type="button" className="link-button" onClick={() => propose({ op: "complete", slotId: slot.id, revision: slot.revision, completed: !slot.completedAt }, slot.completedAt ? "Ta bort genomförandemarkeringen?" : `Registrera ${title} som genomfört?`)}>{slot.completedAt ? "Ångra genomförande" : "Markera genomfört"}</button>}
 </div>;
}
function DutySettings({ schedule, timeZone, propose }: { schedule: DutySchedule; timeZone: string; propose: (c: DutyCommand, text: string) => void }) {
 const [date, setDate] = useState(new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(schedule.selfServiceUntil)));
 const [time, setTime] = useState(new Intl.DateTimeFormat("sv-SE", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(schedule.selfServiceUntil)));
 const [claim, setClaim] = useState(schedule.claimRequiresApproval);
 const [change, setChange] = useState(schedule.changeRequiresApproval);
 return <details className="workflow-disclosure"><summary>Regler för självservice</summary><label className="duty-completed"><input type="checkbox" checked={claim} onChange={e => setClaim(e.target.checked)} />Ledaren godkänner bokningar</label><label className="duty-completed"><input type="checkbox" checked={change} onChange={e => setChange(e.target.checked)} />Ledaren godkänner flytt och byte</label><p>Självservice till datum och klockslag</p><DateTimeRangeFields mode="single" startDate={date} endDate={date} startTime={time} endTime={time} onDatesChange={setDate} onStartTimeChange={setTime} startLabel="Självservice stänger" /><p>Självservice stänger senast när aktiviteten börjar. Begäran om ersättare kräver alltid ledargodkännande.</p><button type="button" className="secondary" onClick={() => propose({ op: "settings", claimRequiresApproval: claim, changeRequiresApproval: change, selfServiceUntil: localActivityTime(date, time, timeZone).toISOString() }, "Spara reglerna för självservice? Reglerna gäller också väntande förslag när de behandlas.")}>Spara regler</button></details>;
}
function DutyCreator({ activityId, startsAt, endsAt, timeZone, schedule, propose }: { schedule: DutySchedule; activityId: string; startsAt: string; endsAt: string; timeZone: string; propose: (c: DutyCommand, text: string) => void }) {
 const [types, setTypes] = useState<{id:string;name:string}[]>([]);
 const [type, setType] = useState("");
 const [newType, setNewType] = useState("");
 const [error,setError] = useState(""); const [busy,setBusy] = useState(false);
 useEffect(() => { let active=true; fetch(`/api/activities/${activityId}/duties`).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error);return b;}).then(b=>{if(active)setTypes(b.duties);}).catch(()=>{if(active)setError("Uppgiftstyper kunde inte hämtas");});return()=>{active=false;}; },[activityId]);
 async function addType(){setBusy(true);setError("");try{const r=await fetch(`/api/activities/${activityId}/duties`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:newType})});const b=await r.json();if(!r.ok)throw new Error(b.error);setTypes(t=>[...t,b.duty]);setType(b.duty.id);setNewType("");}catch(e){setError(e instanceof Error?e.message:"Kunde inte skapa uppgiftstyp");}finally{setBusy(false);}}

 return <details className="workflow-disclosure duty-creator"><summary>Lägg till uppgift i schemat</summary>
 <div className="duty-editor-section"><div className="workflow-section-heading"><h4>Uppgiftstyp</h4></div>
 <label>Uppgift<select value={type} onChange={e=>setType(e.target.value)}><option value="">Välj uppgift</option>{types.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
 {type ? <p className="duty-selected-type">{types.find(t=>t.id===type)?.name}</p> : null}
 <details className="duty-new-type"><summary>Skapa ny uppgiftstyp</summary><label>Namn<input maxLength={80} value={newType} onChange={e=>setNewType(e.target.value)} placeholder="Cafébemanning eller bakning"/></label><button type="button" className="secondary" disabled={!newType.trim()||busy} onClick={()=>void addType()}>Lägg till typ</button></details><DutyTypes schedule={schedule} propose={propose} /></div>
 <DutySeriesForm startsAt={startsAt} endsAt={endsAt} timeZone={timeZone} disabled={!type || busy} buttonLabel="Förhandsgranska uppgift" onReview={definition => propose({ op: "create_series", dutyTypeId: type, definition }, `Skapa en ${types.find(t => t.id === type)?.name}-serie med ${expandDutySeries(definition).length} pass och ${definition.places} platser per pass?`)} />
 <div className="duty-allocation-info"><h4>Bokning och tilldelning</h4><p>Skapade platser börjar lediga för självbokning enligt aktivitetens självserviceregler. Efter sparande kan du tilldela spelare på respektive plats eller använda Föreslå rättvis fördelning.</p></div>
 {error && <p role="alert">{error}</p>}</details>;
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
 return <details className="workflow-disclosure"><summary>Tidigare arbetsuppgifter</summary><div className="participant-selection"><label>Spelare<select value={person} disabled={busy} onChange={e => { setPerson(e.target.value); setRows([]); setNotice(""); }}><option value="">Välj spelare</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button type="button" className="secondary" disabled={!person || busy} onClick={() => void load()}>Visa historik</button></div><p>Högst 20 påbörjade uppgifter inom laget.</p>{rows.length > 0 && <ul>{rows.map((r,i) => <li key={i}>{new Intl.DateTimeFormat("sv-SE", { timeZone, dateStyle: "short" }).format(new Date(r.starts_at))} · {r.activity_title} · {r.duty_name} · {r.completed_at ? "Genomfört" : "Inte registrerat som genomfört"}</li>)}</ul>}{notice && <p role="status">{notice}</p>}</details>;
}
