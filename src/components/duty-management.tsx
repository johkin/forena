"use client";
import { useState } from "react";
import { dutyDefinitionSchema, type Duty, type DutyCommand, type DutySchedule } from "@/lib/activity-duty-schedule";
import { formatDutyTiming } from "@/lib/duty-presentation";
import { localActivityTime } from "@/lib/activity-time-rules";
import { suggestDutyAssignments, type DutyCandidate, type DutySuggestion } from "@/lib/duty-fairness";
type Propose = (command: DutyCommand, text: string) => void;
function localValue(value: string | null, zone: string) {
 if (!value) return "";
 const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
 const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
 return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
function instant(value: string, zone: string) {
 if (!value) throw new Error("Ange datum och tid");
 const [date,time] = value.split("T");
 if (Number(time.split(":")[1]) % 5) throw new Error("Välj femminuterssteg");
 return localActivityTime(date,time,zone).toISOString();
}
export function DutyEditor({ duty, timeZone, propose }: { duty: Duty; timeZone: string; propose: Propose }) {
 const [kind,setKind]=useState(duty.timingKind);
 const [start,setStart]=useState(localValue(duty.startsAt,timeZone));
 const [end,setEnd]=useState(localValue(duty.endsAt,timeZone));
 const [due,setDue]=useState(localValue(duty.dueAt,timeZone));
 const [instructions,setInstructions]=useState(duty.instructions);
 const [places,setPlaces]=useState(duty.slots.length);
 const [error,setError]=useState("");
 const completed=duty.slots.some(s=>s.completedAt);
 function review() {
   try {
     const definition=dutyDefinitionSchema.parse({ timingKind:kind, startsAt:kind==="interval"?instant(start,timeZone):null, endsAt:kind==="interval"?instant(end,timeZone):null, dueAt:kind==="deadline"?instant(due,timeZone):null, instructions, places });
     setError("");
     propose({op:"edit_duty",dutyId:duty.id,revision:duty.revision,definition},`Ändra ${duty.name}: ${kind==="interval"?`${start.replace("T"," ")}–${end.replace("T"," ")}`:kind==="deadline"?`lämnas senast ${due.replace("T"," ")}`:"ingen särskild tid"}, ${places} platser. Instruktioner: ${instructions || "inga"}. Berörda familjer meddelas och väntande ändringsförslag för dessa platser blir inaktuella.`);
   } catch { setError("Kontrollera datum, tider och antal platser."); }
 }
 return <details><summary>Redigera enskilt pass</summary>{completed?<p>Uppgiften har genomförande registrerat och behålls som historik.</p>:<>
 <div className="participant-selection"><label>Tidstyp<select value={kind} onChange={e=>setKind(e.target.value as Duty["timingKind"])}><option value="interval">Tidsintervall</option><option value="deadline">Leveransdeadline</option><option value="none">Ingen särskild tid</option></select></label><label>Antal platser<input type="number" min={1} max={50} value={places} onChange={e=>setPlaces(Number(e.target.value))}/></label></div>
 {kind==="interval"&&<div className="participant-selection"><label>Från<input type="datetime-local" step={300} value={start} onChange={e=>setStart(e.target.value)}/></label><label>Till<input type="datetime-local" step={300} value={end} onChange={e=>setEnd(e.target.value)}/></label></div>}
 {kind==="deadline"&&<label>Lämnas senast<input type="datetime-local" step={300} value={due} onChange={e=>setDue(e.target.value)}/></label>}
 <label>Instruktioner<textarea maxLength={2000} value={instructions} onChange={e=>setInstructions(e.target.value)}/></label>
 <p>Antalet kan minskas genom att ta bort lediga platser. Genomförda uppgifter ändras inte.</p>
 {error&&<p role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={review}>Granska ändring</button><button type="button" className="secondary" onClick={()=>propose({op:"cancel_duty",dutyId:duty.id,revision:duty.revision},`Ta bort ${duty.name} ur schemat? Alla ${duty.slots.length} platser tas bort ur bokningen, tilldelningar frigörs och berörda familjer meddelas. Historik sparas.`)}>Ta bort uppgiften</button></div>
 </>}</details>;
}
function TypeEditor({ type, propose }: { type: DutySchedule["types"][number]; propose: Propose }) {
 const [name,setName]=useState(type.name);
 return <div className="duty-row"><label>Uppgiftstyp<input value={name} maxLength={80} onChange={e=>setName(e.target.value)}/></label><p>{type.active?"Aktiv":"Inaktiverad"}</p><div className="modal-actions"><button type="button" className="secondary" disabled={!name.trim()||name.trim()===type.name} onClick={()=>propose({op:"edit_type",dutyTypeId:type.id,revision:type.revision,name,active:type.active},`Byt namn från ${type.name} till ${name}. Befintliga scheman behåller sina namn.`)}>Byt namn</button><button type="button" className="secondary" onClick={()=>propose({op:"edit_type",dutyTypeId:type.id,revision:type.revision,name:type.name,active:!type.active},`${type.active?"Inaktivera":"Aktivera"} ${type.name} för nya uppgifter? Befintliga scheman och historik behålls.`)}>{type.active?"Inaktivera":"Aktivera"}</button></div></div>;
}
export function DutyTypes({ schedule, propose }: { schedule: DutySchedule; propose: Propose }) {
 return <details><summary>Hantera uppgiftstyper</summary>{schedule.types.map(t=><TypeEditor key={`${t.id}:${t.revision}`} type={t} propose={propose}/>)}</details>;
}
export function DutyDistribution({ activityId, schedule, timeZone, propose }: { activityId: string; schedule: DutySchedule; timeZone: string; propose: Propose }) {
 const [from,setFrom]=useState(()=>`${new Date().getFullYear()}-01-01`);
 const [rows,setRows]=useState<DutySuggestion[]>([]);
 const [candidates,setCandidates]=useState<DutyCandidate[]>([]);
 const [error,setError]=useState(""); const [busy,setBusy]=useState(false); const [loaded,setLoaded]=useState(false);
 async function suggest() {
   setBusy(true);setError("");setLoaded(false);setRows([]);
   try { const r=await fetch(`/api/activities/${activityId}/duty-schedule?fairnessFrom=${encodeURIComponent(from)}`);const body=await r.json();if(!r.ok)throw new Error(body.error);setCandidates(body);setRows(suggestDutyAssignments(schedule,body));setLoaded(true); }
   catch(e){setError(e instanceof Error?e.message:"Förslaget kunde inte hämtas");}finally{setBusy(false);}
 }
 const selected=rows.filter(r=>r.personId);
 const label = (d: Duty) => `${d.name} · ${formatDutyTiming(d, timeZone)}`;
 return <details><summary>Föreslå rättvis fördelning</summary><p>Färre genomförda uppgifter prioriteras. Vid lika antal prioriteras variation från senaste uppgiften, därefter färre av samma typ. Förslaget ger högst en ny uppgift per spelare och behåller befintliga bokningar. Saknad registrering betyder inte säkert att personen aldrig arbetat. Krockar med andra aktiviteter kontrolleras inte ännu.</p>
 <label>Räkna genomförda uppgifter från<input type="date" value={from} onChange={e=>{setFrom(e.target.value);setRows([]);setLoaded(false);}}/></label><button type="button" className="secondary" disabled={busy||!from} onClick={()=>void suggest()}>{busy?"Hämtar…":"Ta fram förslag"}</button>
 {error&&<p role="alert">{error}</p>}{loaded&&<p>{rows.length} platser föreslagna. Övriga lediga platser lämnas för manuell tilldelning.</p>}
 {rows.map(row=>{const duty=schedule.duties.find(d=>d.id===row.dutyId)!;const person=candidates.find(p=>p.personId===row.personId);return <div className="duty-row" key={row.slotId}><strong>{label(duty)} · plats {duty.slots.findIndex(s=>s.id===row.slotId)+1}</strong><label>Spelare<select value={row.personId} onChange={e=>setRows(old=>old.map(x=>x.slotId===row.slotId?{...x,personId:e.target.value,reason:"Manuellt ändrat av ledaren."}:x))}><option value="">Hoppa över</option>{schedule.people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><p>{row.reason}</p>{person&&<small>Vald spelare: {person.completed} genomförda, {person.byType[duty.dutyTypeId]??0} av denna typ under perioden.</small>}</div>;})}
 {selected.length>0&&<button type="button" className="primary" onClick={()=>propose({op:"assign_batch",assignments:selected.map(({slotId,personId,revision})=>({slotId,personId,revision}))},`Tilldela ${selected.length} platser enligt tabellen. Berörda familjer meddelas när du bekräftar. Om någon plats har ändrats sparas ingen av tilldelningarna.`)}>Granska tilldelningar</button>}
 </details>;
}
