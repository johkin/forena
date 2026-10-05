"use client";
import { useEffect, useState } from "react";

type Duty = { id: string; name: string };
type Invitee = { personId: string; displayName: string; dutyTypeId?: string | null; dutyCompletedAt?: string | null };
type History = { activity_title: string; starts_at: string; duty_name: string | null; completed_at: string | null; response: string };
export function ActivityDutyEditor({ activityId, invitees, started, timeZone, onSaved }: { activityId: string; invitees: Invitee[]; started: boolean; timeZone: string; onSaved: () => Promise<void> }) {
  const [duties, setDuties] = useState<Duty[]>([]);
  const [isWork, setIsWork] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/activities/${activityId}/duties`).then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.error); return body; }).then(body => { if (!cancelled) { setDuties(body.duties); setIsWork(body.isWork); } }).catch(() => { if (!cancelled) setError("Arbetsuppgifter kunde inte hämtas."); });
    return () => { cancelled = true; };
  }, [activityId]);
  async function create() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/activities/${activityId}/duties`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      setDuties(current => [...current, body.duty]); setName("");
    } catch (e) { setError(e instanceof Error ? e.message : "Kunde inte skapa uppgiften"); }
    finally { setBusy(false); }
  }
  if (!isWork) return error ? <p role="status">{error}</p> : null;
  return <details className="activity-invitation-add"><summary>Arbetsuppgifter och tidigare pass</summary><div className="activity-invitation-add-body"><p className="overview-empty">Uppgiften tilldelas spelaren. Familjen avgör vem som arbetar. Markera genomfört efter passet; ett ja räknas inte som utfört arbete.</p>
    {invitees.map(person => <DutyRow key={`${person.personId}:${person.dutyTypeId}:${person.dutyCompletedAt}`} activityId={activityId} person={person} duties={duties} started={started} timeZone={timeZone} onSaved={onSaved} />)}
    <div className="participant-search"><label>Ny uppgift för laget<input maxLength={80} value={name} placeholder="Exempelvis städning" onChange={e => setName(e.target.value)} /></label><button className="secondary" type="button" disabled={!name.trim() || busy} onClick={() => void create()}>Lägg till uppgift</button></div>{error && <p role="status">{error}</p>}
  </div></details>;
}
function DutyRow({ activityId, person, duties, started, timeZone, onSaved }: { activityId: string; person: Invitee; duties: Duty[]; started: boolean; timeZone: string; onSaved: () => Promise<void> }) {
  const [dutyId, setDutyId] = useState(person.dutyTypeId ?? "");
  const [completed, setCompleted] = useState(Boolean(person.dutyCompletedAt));
  const [history, setHistory] = useState<History[] | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/activities/${activityId}/duties`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ personId: person.personId, dutyTypeId: dutyId || null, completed }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      setNotice("Sparat"); await onSaved();
    } catch (e) { setNotice(e instanceof Error ? e.message : "Uppgiften kunde inte sparas"); }
    finally { setBusy(false); }
  }
  async function loadHistory() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/activities/${activityId}/duties?personId=${person.personId}`);
      const body = await response.json(); if (!response.ok) throw new Error(body.error); setHistory(body.history);
    } catch { setNotice("Historiken kunde inte hämtas"); }
    finally { setBusy(false); }
  }
  return <div className="duty-row"><strong>{person.displayName}</strong><div className="participant-selection"><label>Uppgift<select value={dutyId} disabled={busy} onChange={e => { setDutyId(e.target.value); setCompleted(false); }}><option value="">Ingen uppgift</option>{duties.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label className="duty-completed"><input type="checkbox" checked={completed} disabled={!started || !dutyId || busy} onChange={e => setCompleted(e.target.checked)} />Genomfört</label><button className="secondary" type="button" disabled={busy} onClick={() => void save()}>Spara</button><button className="link-button" type="button" disabled={busy} onClick={() => history ? setHistory(null) : void loadHistory()}>{history ? "Dölj tidigare pass" : "Tidigare pass"}</button></div>
    {history && <><p className="overview-empty">De senaste 20 påbörjade arbetspassen i det här laget.</p>{history.length ? <ul>{history.map((h, i) => <li key={i}>{new Intl.DateTimeFormat("sv-SE", { timeZone, dateStyle: "short" }).format(new Date(h.starts_at))} · {h.activity_title} · {h.duty_name ?? "Ingen uppgift"} · {h.completed_at ? "Genomfört" : h.response === "declined" ? "Tackat nej" : "Inte registrerat som genomfört"}</li>)}</ul> : <p>Inga tidigare pass registrerade.</p>}</>}{notice && <p role="status">{notice}</p>}
  </div>;
}
