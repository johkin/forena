"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  personId: string;
  displayName: string;
  role: "participant" | "leader";
  response: "pending" | "accepted" | "declined" | null;
  present: boolean;
};

type Props = { activityId: string; onClose: () => void; onSaved?: () => void };

export function AttendanceModal({ activityId, onClose, onSaved }: Props) {
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
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const addAccepted = () => setSelected((current) => new Set([...current, ...accepted.map((row) => row.personId)]));

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
      <p className="overview-empty">{reportedAt ? "Närvaron är redan rapporterad. Du kan justera den nedan." : "Markera de personer som faktiskt deltog."}</p>
      {error ? <div className="auth-error">{error}</div> : null}
      <div className="attendance-actions"><button className="secondary" type="button" onClick={addAccepted}>Lägg till alla anmälda ({accepted.length})</button><span>{selected.size} närvarande</span></div>
      <div className="attendance-roster">
        {rows.map((row) => <label key={row.personId} className="attendance-row">
          <input type="checkbox" checked={selected.has(row.personId)} onChange={() => toggle(row.personId)} />
          <span><strong>{row.displayName}</strong><small>{row.role === "leader" ? "Ledare" : row.response === "accepted" ? "Anmäld" : row.response === "declined" ? "Tackat nej" : row.response === "pending" ? "Ej svarat" : "Ej kallad"}</small></span>
        </label>)}
      </div>
      <div className="modal-actions"><button className="secondary" onClick={onClose} type="button">Avbryt</button><button className="primary" disabled={saving} onClick={save} type="button">{saving ? "Sparar…" : "Spara närvaro"}</button></div>
    </section>
  </div>;
}
