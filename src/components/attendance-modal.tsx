"use client";

import { useEffect, useMemo, useState } from "react";
import { attendanceNames } from "@/lib/attendance-names";
import { useModalScrollLock } from "@/lib/use-modal-scroll-lock";

type Row = {
  personId: string;
  displayName: string;
  role: "participant" | "leader" | "volunteer";
  response: "pending" | "accepted" | "declined" | null;
  present: boolean;
};

type Props = { activityId: string; onClose: () => void; onSaved?: () => void };
const roleLabels = { leader: "Ledare", participant: "Spelare", volunteer: "Övriga roller" } as const;
const roles: Row["role"][] = ["leader", "participant", "volunteer"];

export function AttendanceModal({ activityId, onClose, onSaved }: Props) {
  useModalScrollLock();
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reportedAt, setReportedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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

  function peopleByRole(people: Row[], isPresent: boolean) {
    return roles.map((role) => {
      const matching = people.filter((row) => row.role === role);
      return matching.length ? <div className="person-picker-group" key={role}>
        <h4>{roleLabels[role]} ({matching.length})</h4>
        {matching.map((row) => <button key={row.personId} type="button" className="attendance-person" onClick={() => toggle(row.personId)}
          aria-label={`${row.displayName}, ${roleLabels[role].toLowerCase()}. Flytta till ${isPresent ? "ej närvarande" : "närvarande"}`} title={row.displayName}>
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
      <div className="attendance-actions"><button className="secondary" type="button" onClick={addAccepted}>Lägg till alla anmälda ({accepted.length})</button><span>{selected.size} närvarande</span></div>
      <div className="attendance-columns">
        {([{ title: "Ej närvarande", people: absent, isPresent: false }, { title: "Närvarande", people: present, isPresent: true }] as const).map((column) =>
          <section className="attendance-column" key={column.title} aria-label={`${column.title}, ${column.people.length} personer`}>
            <h3 className={column.isPresent ? "attendance-present-heading" : "attendance-absent-heading"}>{column.title} ({column.people.length})</h3>
            <div className="attendance-roster">{peopleByRole(column.people, column.isPresent)}</div>
          </section>)}
      </div>
      <div className="modal-actions"><button className="secondary" onClick={onClose} type="button">Avbryt</button><button className="primary" disabled={saving} onClick={save} type="button">{saving ? "Sparar…" : "Spara närvaro"}</button></div>
    </section>
  </div>;
}
