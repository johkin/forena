"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PersonSelectionList } from "./person-selection-list";
import { useModalScrollLock } from "@/lib/use-modal-scroll-lock";

import type { components } from "../../backend/contract/generated";

export type AttendanceRow = components["schemas"]["AttendancePerson"];
export type AttendanceSnapshot = components["schemas"]["AttendanceSnapshot"];
type Row = AttendanceRow;
type Props = { activityId: string; onClose: () => void; onSaved?: () => void;
  request?: (path: string, init?: RequestInit) => Promise<Response>; versioned?: boolean };
const defaultRequest = (path: string, init?: RequestInit) => fetch(path, init);
const roleLabels = { leader: "Ledare", participant: "Spelare", volunteer: "Funktionärer", guardian: "Målsmän" } as const;
const roles = ["participant", "leader", "guardian", "volunteer"] as const;

/** Load permitted attendance rows and edit a controlled selection before saving. */
export function AttendanceModal({ activityId, onClose, onSaved, request = defaultRequest, versioned = false }: Props) {
  useModalScrollLock();
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reportedAt, setReportedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "present" | "absent">("all");
  const [search, setSearch] = useState("");

  const [quickGroups, setQuickGroups] = useState<{id:string;label:string;personIds:string[]}[]>([]);

  const [snapshot, setSnapshot] = useState<AttendanceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<AttendanceSnapshot | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [retry, setRetry] = useState(0);
  const dialogRef = useRef<HTMLElement>(null);
  // Disabled or removed action buttons can otherwise leave focus on the document body.
  const focusDialog = () => requestAnimationFrame(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus();
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    dialog?.querySelector<HTMLElement>("button")?.focus();
    const containFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), summary, [href]")]
        .filter(element => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      const active = document.activeElement;
      const atContainer = active === dialog || !dialog.contains(active);
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && (atContainer || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (atContainer || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    // Listen on the document so a disabled or removed control cannot strand focus outside the dialog.
    document.addEventListener("keydown", containFocus);
    return () => {
      document.removeEventListener("keydown", containFocus);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    request(`/api/activities/${activityId}/attendance`, { signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Närvaron kunde inte hämtas");
      return body;
    }).then((body: AttendanceSnapshot & { groupsError?: string }) => {
      if (controller.signal.aborted) return;
      setRows(body.roster ?? []);
      setQuickGroups(body.groups ?? []);
      setSelected(new Set((body.roster ?? []).filter(row => row.present).map(row => row.personId)));
      setReportedAt(body.reportedAt ?? null);
      setSnapshot(body);
      setError(body.groupsError ?? "");
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Närvaron kunde inte hämtas");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [activityId, request, retry]);

  const readOnly = versioned && snapshot !== null && !snapshot.writable;
  const disabled = saving || loading || readOnly;

  async function loadLatest() {
    setSaving(true);
    try {
      const response = await request(`/api/activities/${activityId}/attendance`);
      if (!response.ok) throw new Error("Senaste rapporten kunde inte hämtas. Dina val finns kvar.");
      setLatest(await response.json());
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Rapporten kunde inte hämtas."); }
    finally { setSaving(false); focusDialog(); }
  }

  function reconcile() {
    if (!latest) return;
    // Keep the local draft, including explicit additions, while showing the latest server selection.
    const merged = new Map(rows.map(row => [row.personId, row]));
    latest.roster.forEach(row => merged.set(row.personId, row));
    setRows([...merged.values()]);
    setSnapshot(latest);
    setSelected(current => new Set([...current].filter(id => merged.has(id))));
    setQuickGroups(latest.groups);
    setReportedAt(latest.reportedAt);
    setConflict(false);
    setLatest(null);
    focusDialog();
  }

  const accepted = useMemo(() => rows.filter((row) => row.response === "accepted"), [rows]);
  const absent = rows.filter((row) => !selected.has(row.personId));
  const present = rows.filter((row) => selected.has(row.personId));
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const addAccepted = () => setSelected((current) => new Set([...current, ...accepted.map((row) => row.personId)]));

  const visibleRows = (filter === "present" ? present : filter === "absent" ? absent : rows)
    .filter(row => row.displayName.toLocaleLowerCase("sv-SE").includes(search.trim().toLocaleLowerCase("sv-SE")))
    .map(row => ({ id: row.personId, name: row.displayName, role: row.role,
      detail: row.response === "accepted" ? "Anmäld" : row.response === "declined" ? "Tackat nej" : row.response === "pending" ? "Ej svarat" : "Ej kallad" }));

  /** Persist the full selection, including people hidden by active filters. */
  async function save(emptyConfirmed = false) {
    if (!selected.size && !emptyConfirmed) { setConfirmEmpty(true); return; }
    setConfirmEmpty(false);
    setSaving(true); setError("");
    try {
      const response = await request(`/api/activities/${activityId}/attendance`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ personIds: [...selected], ...(versioned ? { revision: snapshot?.revision, rosterIds: rows.map(row => row.personId), confirmEmpty: emptyConfirmed } : {}) }),
      });
      if (!response.ok) {
        if (versioned && response.status === 409) setConflict(true);
        const body = await response.json();
        throw new Error(body.error || "Närvaron kunde inte sparas");
      }
      onSaved?.(); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Närvaron kunde inte sparas"); }
    finally { setSaving(false); focusDialog(); }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (!saving && event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="modal attendance-modal" role="dialog" aria-modal="true" aria-labelledby="attendance-title" tabIndex={-1}
      onKeyDown={event => {
        if (event.key === "Escape" && !saving) { event.preventDefault(); onClose(); }
      }}>
      <div className="card-heading"><div><p className="eyebrow">Aktivitet</p><h2 id="attendance-title">Rapportera närvaro</h2></div><button className="icon-button" onClick={onClose} aria-label="Stäng" disabled={saving} type="button">✕</button></div>
      {versioned && snapshot?.status === "cancelled" ? <p role="status">Inställd. Befintlig närvarorapport visas som historik och kan inte ändras.</p> : null}
      {versioned && readOnly && snapshot?.status !== "cancelled" ? <p role="status">Närvaro kan rapporteras från aktivitetens starttid.</p> : null}
      {loading ? <p role="status">Laddar närvaron…</p> : null}
      <p className="overview-empty">{reportedAt ? (readOnly ? "Närvaron är rapporterad och visas i läsläge." : "Närvaron är redan rapporterad. Du kan justera den nedan.") : "Närvaron är okänd tills rapporten sparas. Markera närvarande personer. Spara bekräftar att hela listan är genomgången; övriga registreras som frånvarande."}</p>
      {error ? <div className="auth-error" role="alert">{error}</div> : null}
      {!loading && !snapshot ? <button type="button" className="secondary" onClick={() => { setLoading(true); setRetry(value => value + 1); }}>Försök igen</button> : null}
      {conflict ? <div role="alert"><p>Rapporten kunde inte sparas. Dina val finns kvar.</p><button type="button" className="secondary" disabled={disabled} onClick={loadLatest}>Läs in senaste rapporten för avstämning</button></div> : null}
      {latest ? <section aria-label="Stäm av senaste rapporten"><h3>Senaste rapporten</h3>
        <p>Dina markeringar finns kvar i listan. Jämför med den senast sparade rapporten nedan och justera dina val innan du sparar igen.</p>
        <ul>{latest.roster.map(row => <li key={row.personId}>{row.displayName}: {row.present === null ? "Okänd" : row.present ? "Närvarande" : "Frånvarande"}</li>)}</ul>
        <button type="button" className="secondary" onClick={reconcile}>Använd senaste versionen och behåll mina val</button>
      </section> : null}
      <div className="attendance-summary" aria-label="Närvarosammanfattning"><div><strong>{present.length}</strong><span>Närvarande</span></div><div><strong>{absent.length}</strong><span>{reportedAt ? "Ej närvarande" : "Ej markerade · okänd närvaro"}</span></div><div><strong>{present.filter(row => row.role === "leader").length}</strong><span>Ledare på plats</span></div></div>
      <div className="attendance-actions"><button className="secondary" type="button" onClick={addAccepted} disabled={disabled}>Lägg till alla anmälda ({accepted.length})</button></div>
      <label className="attendance-search">Sök deltagare<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Sök på namn" /></label>
      <div className="attendance-list-filter segmented-control" role="group" aria-label="Filtrera närvaro">{([{ value: "all", label: "Alla", count: rows.length }, { value: "present", label: "Närvarande", count: present.length }, { value: "absent", label: "Ej närvarande", count: absent.length }] as const).map(item => <button key={item.value} type="button" className={filter === item.value ? "selected" : ""} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label} ({item.count})</button>)}</div>
      <PersonSelectionList people={visibleRows} groups={roles.map(role=>({role,label:roleLabels[role]}))} selected={selected} onToggle={toggle} quickGroups={quickGroups} onSelectionChange={setSelected} disabled={disabled} emptyMessage="Inga deltagare matchar filtret eller sökningen."/>
      {versioned && snapshot && !readOnly ? <section aria-label="Lägg till befintlig medlem">
        <h3>Lägg till befintlig medlem</h3><p>Medlemmar i samma klubb och sektion. Tillägget gäller bara denna aktivitet.</p>
        <label>Sök medlem<input type="search" value={candidateSearch} disabled={disabled} onChange={event => setCandidateSearch(event.target.value)} /></label>
        {candidateSearch.trim() ? snapshot.candidates.filter(person => !rows.some(row => row.personId === person.personId) && person.displayName.toLocaleLowerCase("sv-SE").includes(candidateSearch.trim().toLocaleLowerCase("sv-SE"))).map(person =>
          <button key={person.personId} type="button" className="secondary" disabled={disabled} onClick={() => { setRows(current => [...current, person]); setCandidateSearch(""); focusDialog(); }}>Lägg till {person.displayName}</button>) : null}
      </section> : null}
      {versioned && snapshot?.history.length ? <details><summary>Ändringshistorik ({snapshot.history.length})</summary>
        {snapshot.history.map(entry => <section key={entry.revision}><h3>{entry.actorName} · <time dateTime={entry.changedAt}>{new Date(entry.changedAt).toLocaleString("sv-SE")}</time></h3>
          {entry.changes.length ? <ul>{entry.changes.map(change => <li key={change.personId}>{change.displayName}: {change.previousPresent === null ? "Okänd" : change.previousPresent ? "Närvarande" : "Frånvarande"} → {change.present ? "Närvarande" : "Frånvarande"}</li>)}</ul> : <p>Inga personers närvaro ändrades.</p>}
        </section>)}
      </details> : null}
      {confirmEmpty ? <div role="group" aria-label="Bekräfta 0 närvarande"><p>Du rapporterar 0 närvarande. Alla i listan registreras som frånvarande.</p>
        <button type="button" className="secondary" onClick={() => { setConfirmEmpty(false); focusDialog(); }}>Avbryt bekräftelse</button>
        <button type="button" className="primary" disabled={disabled || conflict} onClick={() => save(true)}>Bekräfta 0 närvarande</button>
      </div> : null}
      <div className="modal-actions"><button className="secondary" disabled={saving} onClick={onClose} type="button">{readOnly ? "Stäng" : "Avbryt"}</button>{!readOnly ? <button className="primary" disabled={disabled || conflict || !snapshot} onClick={() => save()} type="button">{saving ? "Sparar…" : "Spara närvaro"}</button> : null}</div>
    </section>
  </div>;
}
