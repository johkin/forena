"use client";

import { useEffect, useMemo, useState } from "react";
import { PersonSelectionList } from "./person-selection-list";
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
const roles: Row["role"][] = ["participant", "leader", "guardian", "volunteer"];

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
      <p className="overview-empty">{reportedAt ? "Närvaron är redan rapporterad. Du kan justera den nedan." : "Markera kryssrutan för varje person som är närvarande. Spara när du är klar."}</p>
      {error ? <div className="auth-error">{error}</div> : null}
      <div className="attendance-summary" aria-label="Närvarosammanfattning"><div><strong>{present.length}</strong><span>Närvarande</span></div><div><strong>{absent.length}</strong><span>Ej närvarande</span></div><div><strong>{present.filter(row => row.role === "leader").length}</strong><span>Ledare på plats</span></div></div>
      <div className="attendance-actions"><button className="secondary" type="button" onClick={addAccepted} disabled={saving}>Lägg till alla anmälda ({accepted.length})</button><span>{selected.size} närvarande</span></div>
      <label className="attendance-search">Sök deltagare<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Sök på namn" /></label>
      <div className="attendance-list-filter segmented-control" role="group" aria-label="Filtrera närvaro">{([{ value: "all", label: "Alla", count: rows.length }, { value: "present", label: "Närvarande", count: present.length }, { value: "absent", label: "Ej närvarande", count: absent.length }] as const).map(item => <button key={item.value} type="button" className={filter === item.value ? "selected" : ""} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label} ({item.count})</button>)}</div>
      <PersonSelectionList people={visibleRows} groups={roles.map(role=>({role,label:roleLabels[role]}))} selected={selected} onToggle={toggle} disabled={saving} emptyMessage="Inga deltagare matchar filtret eller sökningen."/>
      <div className="modal-actions"><button className="secondary" onClick={onClose} type="button">Avbryt</button><button className="primary" disabled={saving} onClick={save} type="button">{saving ? "Sparar…" : "Spara närvaro"}</button></div>
    </section>
  </div>;
}

