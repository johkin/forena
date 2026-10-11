"use client";

import { useEffect, useMemo, useState } from "react";
import { attendanceNames } from "@/lib/attendance-names";
import { useModalScrollLock } from "@/lib/use-modal-scroll-lock";

type Row = {
  personId: string;
  displayName: string;
  role: "participant" | "leader" | "volunteer" | "guardian";
  response: "pending" | "accepted" | "declined" | null;
  present: boolean;
};

type Props = { activityId: string; onClose: () => void; onSaved?: () => void };
const roleLabels = { leader: "Ledare", participant: "Spelare", volunteer: "Funktionärer", guardian: "Målsmän" } as const;
const roles: Row["role"][] = ["leader", "participant", "guardian", "volunteer"];

export function AttendanceModal({ activityId, onClose, onSaved }: Props) {
  useModalScrollLock();
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reportedAt, setReportedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "present" | "absent">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(`/api/activities/${activityId}/attendance`).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Närvaron kunde inte hämtas");
      return body;
    }).then((body) => {
      setRows(body.roster ?? []);
      setSelected(new Set((body.roster ?? []).filter((row: Row) => row.present).map((row: Row) => row.personId)));
      setReportedAt(body.reportedAt ?? null);
    }).catch((reason) => setError(reason.message));
  }, [activityId]);

  const accepted = useMemo(() => rows.filter((row) => row.response === "accepted"), [rows]);
  const names = useMemo(() => attendanceNames(rows), [rows]);
  const absent = rows.filter((row) => !selected.has(row.personId));
  const present = rows.filter((row) => selected.has(row.personId));
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const addAccepted = () => setSelected((current) => new Set([...current, ...accepted.map((row) => row.personId)]));

  function peopleByRole(people: Row[]) {
    return roles.map((role) => {
      const matching = people.filter((row) => row.role === role && row.displayName.toLocaleLowerCase("sv-SE").includes(search.trim().toLocaleLowerCase("sv-SE")));
      return matching.length ? <div className="person-picker-group" key={role}>
        <h4>{roleLabels[role]} ({matching.length})</h4>
        {matching.map((row) => <button key={row.personId} type="button" className="attendance-person" aria-pressed={selected.has(row.personId)} onClick={() => toggle(row.personId)}
          aria-label={`${row.displayName}, ${roleLabels[role].toLowerCase()}. Flytta till ${selected.has(row.personId) ? "ej närvarande" : "närvarande"}`} title={row.displayName}>
          <span className="attendance-person-state" aria-hidden="true">{selected.has(row.personId) ? "✓" : "+"}</span>
          <strong>{names.get(row.personId)}</strong>
          <small>{row.response === "accepted" ? "Anmäld" : row.response === "declined" ? "Tackat nej" : row.response === "pending" ? "Ej svarat" : "Ej kallad"}</small>
        </button>)}
      </div> : null;
    });
  }

  async function save() {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/activities/${activityId}/attendance`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ personIds: [...selected] }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Närvaron kunde inte sparas");
      setReportedAt(body.reportedAt); onSaved?.(); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Närvaron kunde inte sparas"); }
    finally { setSaving(false); }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal attendance-modal" role="dialog" aria-modal="true" aria-labelledby="attendance-title">
      <div className="card-heading"><div><p className="eyebrow">Aktivitet</p><h2 id="attendance-title">Rapportera närvaro</h2></div><button className="icon-button" onClick={onClose} aria-label="Stäng" type="button">✕</button></div>
      <p className="overview-empty">{reportedAt ? "Närvaron är redan rapporterad. Du kan justera den nedan." : "Tryck på namnen för att flytta personer mellan listorna. Spara när du är klar."}</p>
      {error ? <div className="auth-error">{error}</div> : null}
      <div className="attendance-summary" aria-label="Närvarosammanfattning"><div><strong>{present.length}</strong><span>Närvarande</span></div><div><strong>{absent.length}</strong><span>Ej närvarande</span></div><div><strong>{present.filter(row => row.role === "leader").length}</strong><span>Ledare på plats</span></div></div>
      <div className="attendance-actions"><button className="secondary" type="button" onClick={addAccepted}>Lägg till alla anmälda ({accepted.length})</button><span>{selected.size} närvarande</span></div>
      <label className="attendance-search">Sök deltagare<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Sök på namn" /></label>
      <div className="attendance-mobile-filter segmented-control" role="group" aria-label="Filtrera närvaro">{([{ value: "all", label: "Alla", count: rows.length }, { value: "present", label: "Närvarande", count: present.length }, { value: "absent", label: "Ej närvarande", count: absent.length }] as const).map(item => <button key={item.value} type="button" className={filter === item.value ? "selected" : ""} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label} ({item.count})</button>)}</div>
      <div className="attendance-mobile-list">{peopleByRole(filter === "present" ? present : filter === "absent" ? absent : rows)}</div>
      <div className="attendance-columns attendance-desktop-columns">
        {([{ title: "Ej närvarande", people: absent, isPresent: false }, { title: "Närvarande", people: present, isPresent: true }] as const).map((column) =>
          <section className="attendance-column" key={column.title} aria-label={`${column.title}, ${column.people.length} personer`}>
            <h3 className={column.isPresent ? "attendance-present-heading" : "attendance-absent-heading"}>{column.title} ({column.people.length})</h3>
            <div className="attendance-roster">{peopleByRole(column.people)}</div>
          </section>)}
      </div>
      <div className="modal-actions"><button className="secondary" onClick={onClose} type="button">Avbryt</button><button className="primary" disabled={saving} onClick={save} type="button">{saving ? "Sparar…" : "Spara närvaro"}</button></div>
    </section>
  </div>;
}

