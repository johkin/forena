"use client";

import { useEffect, useState } from "react";
export type TelegramTeam = { id: string; name: string; teamActive: boolean; leadersActive: boolean };
type GroupState = { teams: TelegramTeam[]; available: boolean; pairingUrl?: string };

export function TelegramGroupsView({ state, pending, error, onUpdate }: {
  state: GroupState | null; pending: boolean; error: string;
  onUpdate: (operation: "start" | "disable" | "status", teamId: string, kind: string) => void;
}) {
  const [teamId, setTeamId] = useState("");
  const [kind, setKind] = useState("team");
  const [consent, setConsent] = useState(false);
  const team = state?.teams.find(t => t.id === teamId) ?? state?.teams[0];
  const active = kind === "team" ? team?.teamActive : team?.leadersActive;
  return <section className="form-section" aria-label="Telegram-grupper"><h2>Lag- och ledarchatt</h2>
    <p>Koppla din privata Telegram-chatt först. Välj sedan en grupp där du är administratör och lägg till boten som administratör. Gruppen får en länk till laget via /forena. Kallelser och personliga svar skickas privat.</p>
    {error ? <p className="auth-error" role="alert">{error}</p> : null}
    {!state ? <p role="status">Hämtar grupper…</p> : !state.available ? <p>Telegram är inte tillgängligt ännu.</p> : !team ? <p>Du behöver behörighet att hantera lagets trupp för att koppla en grupp.</p> : <>
      <label>Lag<select value={team.id} disabled={pending} onChange={e => { setTeamId(e.target.value); setConsent(false); }}>{state.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label>Chatt<select value={kind} disabled={pending} onChange={e => { setKind(e.target.value); setConsent(false); }}><option value="team">Lagchatt</option><option value="leaders">Ledarchatt</option></select></label>
      <p role="status">{active ? "Gruppen är kopplad." : "Gruppen är inte kopplad."}</p>
      {!active ? <><label className="settings-checkbox"><input type="checkbox" checked={consent} disabled={pending} onChange={e => setConsent(e.target.checked)} />Jag får administrera gruppen och vill koppla den till det valda laget.</label>
        <button type="button" className="primary" disabled={pending || !consent} onClick={() => onUpdate("start", team.id, kind)}>Koppla grupp</button></> : null}
      <button type="button" className="secondary" disabled={pending} onClick={() => onUpdate("disable", team.id, kind)}>Koppla bort eller avbryt</button>
    </>}
    {state?.pairingUrl ? <p><a className="primary" href={state.pairingUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Välj grupp i Telegram</a> Länken gäller tio minuter och avser valet när den skapades. Dela den inte. Återvänd hit och uppdatera status när boten är tillagd.</p> : null}
    <button type="button" className="secondary" disabled={pending} onClick={() => onUpdate("status", "", "")}>Uppdatera gruppstatus</button>
  </section>;
}

export function TelegramGroupSettings() {
  const [state, setState] = useState<GroupState | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/telegram/groups", { cache: "no-store", signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error();
      setState(await r.json());
    }).catch(() => { if (!controller.signal.aborted) setError("Grupperna kunde inte hämtas."); });
    return () => controller.abort();
  }, []);
  async function update(operation: "start" | "disable" | "status", teamId: string, kind: string) {
    setPending(true); setError("");
    try {
      const r = await fetch("/api/telegram/groups", operation === "status" ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation, teamId, kind, consent: true }) });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Gruppen kunde inte sparas.");
      setState(body);
    } catch (e) { setError(e instanceof Error ? e.message : "Gruppen kunde inte sparas."); }
    finally { setPending(false); }
  }
  return <TelegramGroupsView state={state} pending={pending} error={error} onUpdate={(...args) => void update(...args)} />;
}

export function TelegramGroupExamples() {
  const [mode, setMode] = useState("inactive");
  return <section id="telegram-group-example"><label>Telegram-grupp: exempeltillstånd<select value={mode} onChange={e => setMode(e.target.value)}>{["inactive", "active", "pairing", "pending", "loading", "error", "unavailable", "no-access"].map(m => <option key={m}>{m}</option>)}</select></label>
    <TelegramGroupsView state={mode === "loading" ? null : { available: mode !== "unavailable", teams: mode === "no-access" ? [] : [{ id: "example", name: "Exempelförening · F2016", teamActive: mode === "active", leadersActive: false }], pairingUrl: mode === "pairing" ? "#telegram-group-example" : undefined }} pending={mode === "pending"} error={mode === "error" ? "Gruppen kunde inte sparas." : ""} onUpdate={operation => setMode(operation === "start" ? "pairing" : operation === "disable" ? "inactive" : "active")} />
  </section>;
}
