"use client";

import { useState } from "react";
import { AttendanceModal, type AttendanceSnapshot } from "./attendance-modal";

const example: AttendanceSnapshot = {
  revision: 0, reportedAt: null, status: "scheduled", writable: true,
  roster: [
    { personId: "coach", displayName: "Alex Andersson", role: "leader", response: "accepted", present: null },
    { personId: "player", displayName: "Alva Lind", role: "participant", response: "declined", present: null },
    { personId: "guest", displayName: "Kim Berg", role: "participant", response: "pending", present: null },
  ],
  candidates: [{ personId: "extra", displayName: "Ella Holm", role: "participant", response: null, present: null }],
  groups: [{ id: "green", label: "Grupp Grön", personIds: ["coach", "player"] }], history: [],
};
const recorded: AttendanceSnapshot = {
  ...example, revision: 1, reportedAt: "2026-10-26T18:00:00Z",
  roster: example.roster.map(row => ({ ...row, present: row.personId === "coach" })),
  history: [{ revision: 1, actorName: "Ledare Alex", changedAt: "2026-10-26T18:00:00Z",
    changes: example.roster.map(row => ({ ...row, previousPresent: null, present: row.personId === "coach" })) }],
};
const modes = ["Ny rapport", "Sparad rapport", "Inställd", "Konflikt", "Sparfel", "Laddar", "Tom lista", "Läsfel"] as const;
type Mode = typeof modes[number];

export function AttendanceExamples() {
  const [mode, setMode] = useState<Mode>("Ny rapport");
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  // The transport is local to this gallery; it never writes business data.
  const request = async (_path: string, init?: RequestInit): Promise<Response> => {
    if (mode === "Laddar") return new Promise(() => {});
    if (mode === "Läsfel") return Response.json({ error: "Närvaron kunde inte hämtas." }, { status: 503 });
    if (init?.method === "PUT") {
      if (mode === "Konflikt") return Response.json({ error: "En annan ledare har ändrat rapporten. Dina val finns kvar." }, { status: 409 });
      if (mode === "Sparfel") return Response.json({ error: "Närvaron kunde inte sparas. Försök igen." }, { status: 503 });
      return new Response(null, { status: 204 });
    }
    if (mode === "Inställd") return Response.json({ ...recorded, status: "cancelled", writable: false });
    if (mode === "Sparad rapport" || mode === "Konflikt") return Response.json(recorded);
    if (mode === "Tom lista") return Response.json({ ...example, roster: [], groups: [], candidates: [] });
    return Response.json(example);
  };
  return <section id="attendance-example"><h2>Närvaroregistrering</h2>
    <p>Prova registrering, korrigering, medlemsval, nollbekräftelse och historik med lokala exempel.</p>
    <label>Närvaroläge<select value={mode} onChange={event => {
      const value = modes.find(value => value === event.target.value);
      if (value) setMode(value);
    }}>{modes.map(value => <option key={value}>{value}</option>)}</select></label>
    <button type="button" className="primary" onClick={() => { setSaved(false); setOpen(true); }}>Öppna närvaro</button>
    {saved ? <p role="status">Närvaron sparades i exemplet.</p> : null}
    {open ? <AttendanceModal activityId="example" request={request} versioned onClose={() => setOpen(false)} onSaved={() => setSaved(true)} /> : null}
  </section>;
}
