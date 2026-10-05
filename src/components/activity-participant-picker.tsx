"use client";

import { useEffect, useRef, useState } from "react";
import type { Member } from "@/domain/club";
import { activityRoleLabels, activityRoles, type ActivityRole } from "@/lib/activity-participation";

type Candidate = { personId: string; displayName: string; teamNames: string[]; suggestedRole: ActivityRole | null };
type Props = { activityId: string; rosterMembers: Member[]; invitedIds: string[]; onAdded: () => Promise<void> };
export function ActivityParticipantPicker({ activityId, rosterMembers, invitedIds, onAdded }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Record<string, { person: Candidate; role: ActivityRole | "" }>>({});
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<"invite" | "register" | null>(null);
  const searchVersion = useRef(0);
  useEffect(() => () => { searchVersion.current++; }, [activityId]);
  const roster: Candidate[] = rosterMembers.map(m => ({ personId: m.id, displayName: m.displayName, teamNames: [], suggestedRole: m.teamRelation === "player" ? "participant" : null }));
  const people = (query.trim() ? results : roster).filter(p => !invitedIds.includes(p.personId) && !selected[p.personId]);
  const choices = Object.values(selected);
  async function search() {
    const version = ++searchVersion.current;
    setSearching(true); setNotice(""); setResults([]);
    try {
      const response = await fetch(`/api/activities/${activityId}/participants?q=${encodeURIComponent(query.trim())}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (version !== searchVersion.current) return;
      setResults(body.people);
      setNotice(body.limited ? "Visar högst 30 personer. Förfina sökningen vid behov." : body.people.length ? "" : "Ingen person hittades.");
    } catch (error) { if (version === searchVersion.current) setNotice(error instanceof Error ? error.message : "Sökningen misslyckades"); }
    finally { if (version === searchVersion.current) setSearching(false); }
  }
  async function submit() {
    if (!confirmation) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/activities/${activityId}/participants`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ participants: choices.map(c => ({ personId: c.person.personId, role: c.role })), registerAccepted: confirmation === "register" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setSelected({}); setConfirmation(null);
      setNotice(body.registeredAccepted ? "Personerna har lagts till som anmälda. Inget utskick gjordes." : `Kallelsen köades till ${body.queuedRecipients ?? 0} mottagare.`);
      await onAdded();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Deltagarna kunde inte läggas till"); }
    finally { setBusy(false); }
  }
  return <details className="activity-invitation-add"><summary>Lägg till deltagare</summary><div className="activity-invitation-add-body">
    <p className="overview-empty">Välj från laget eller sök på namn i hela klubben. Spelarens vanliga målsmän får kallelsen.</p>
    <div className="participant-search"><label>Sök namn i klubben<input value={query} maxLength={80} onChange={e => { searchVersion.current++; setSearching(false); setQuery(e.target.value); setResults([]); setNotice(""); }} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (query.trim().length >= 2) void search(); } }} /></label><button className="secondary" type="button" disabled={query.trim().length < 2 || searching || busy} onClick={() => void search()}>{searching ? "Söker…" : "Sök"}</button></div>
    {!confirmation && <><div className="invitation-person-picker">{people.map(p => <button className="attendance-person" type="button" key={p.personId} disabled={busy} onClick={() => setSelected(current => ({ ...current, [p.personId]: { person: p, role: p.suggestedRole ?? "" } }))}><strong>{p.displayName}</strong><small>{p.teamNames.join(", ") || "Lägg till"}</small></button>)}</div>
    {choices.length > 0 && <section><h4>Valda ({choices.length})</h4>{choices.map(({ person, role }) => <div className="participant-selection" key={person.personId}><strong>{person.displayName}</strong><label>Roll i aktiviteten<select value={role} disabled={busy} onChange={e => setSelected(current => ({ ...current, [person.personId]: { person, role: e.target.value as ActivityRole } }))}><option value="">Välj roll</option>{activityRoles.map(r => <option value={r} key={r}>{activityRoleLabels[r]}</option>)}</select></label><button className="secondary" type="button" disabled={busy} onClick={() => setSelected(current => { const next = { ...current }; delete next[person.personId]; return next; })}>Ta bort</button></div>)}</section>}
    <div className="modal-actions"><button className="primary" type="button" disabled={!choices.length || choices.some(c => !c.role) || busy} onClick={() => setConfirmation("invite")}>Granska kallelse</button><button className="secondary" type="button" disabled={!choices.length || choices.some(c => !c.role) || busy} onClick={() => setConfirmation("register")}>Lägg till som anmälda</button></div></>}
    {confirmation && <section><h4>{confirmation === "invite" ? "Bekräfta kallelse" : "Bekräfta anmälan som ledare"}</h4><ul>{choices.map(c => <li key={c.person.personId}>{c.person.displayName} · {c.role ? activityRoleLabels[c.role] : ""}</li>)}</ul><p>{confirmation === "invite" ? "En kallelse skickas till valda personer och deras målsmän." : "Du registrerar att personerna kommer. Inget utskick görs och familjen kan ändra svaret."}</p><div className="modal-actions"><button className="secondary" type="button" disabled={busy} onClick={() => setConfirmation(null)}>Tillbaka</button><button className="primary" type="button" disabled={busy} onClick={() => void submit()}>{busy ? "Sparar…" : confirmation === "invite" ? "Skicka kallelse" : "Bekräfta anmälan"}</button></div></section>}
    {notice && <p role="status">{notice}</p>}
  </div></details>;
}
