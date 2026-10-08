"use client";

import { useEffect, useState } from "react";
import { footballPackage, footballPositions, type DisciplineScope } from "@/lib/disciplines/football";
import type { PlayerSource } from "@/lib/disciplines/field-rules";

type Scope = Exclude<DisciplineScope, "section">;
type Values = Record<string, string | number | string[]>;
type Player = { id: string; name: string };
type Result = { canManageInvitations: boolean; enabled: boolean; editable: boolean; values: Values; revision: number; teamPlayers: Player[]; acceptedPlayers: Player[]; participants: Player[] };
type Props = { teamId: string; scope: Scope; activityId?: string; personId?: string; readOnly?: boolean };
const titles = { team: "Matchförval", teamMembership: "Spelaruppgifter", activity: "Matchuppgifter", activityParticipation: "Spelarens matchuppgifter" };
const labels: Record<string, string> = { ...Object.fromEntries(footballPositions.map(p => [p.id, p.name])), ...Object.fromEntries(footballPackage.gameFormats.map(f => [f.id, f.name])), home: "Hemma", away: "Borta", neutral: "Neutral plan" };

// Changing target unmounts the complete editor, so old values cannot be saved
// to a different player or activity while a new request is loading.
export function FootballFields(props: Props) {
  return <FootballEditor key={`${props.teamId}:${props.scope}:${props.activityId ?? ""}:${props.personId ?? ""}`} {...props}/>;
}
function FootballEditor({ teamId, scope, activityId, personId, readOnly = false }: Props) {
  const [result, setResult] = useState<Result | null>(null);
  const [values, setValues] = useState<Values>({});
  const [source, setSource] = useState<PlayerSource>("acceptedActivityPlayers");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const query = new URLSearchParams({ teamId, scope, ...(activityId ? { activityId } : {}), ...(personId ? { personId } : {}) }).toString();
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/football-fields?${query}`, { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Uppgifterna kunde inte hämtas.");
      if (controller.signal.aborted) return;
      setResult(data); setValues(data.values ?? {}); setSource((data.values?.captainSource as PlayerSource) ?? "acceptedActivityPlayers"); setEditing(false); setError("");
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Uppgifterna kunde inte hämtas."); });
    return () => controller.abort();
  }, [query, reload]);
  const fields = footballPackage.ui[scope].fields.filter(field => field !== "captainPersonId" || result?.canManageInvitations === true);
  const properties = footballPackage.schemas[scope].properties ?? {};
  const candidates = (source === "teamPlayers" ? result?.teamPlayers : result?.acceptedPlayers) ?? [];
  const invalidCaptain = Boolean(values.captainPersonId && !candidates.some(p => p.id === values.captainPersonId));
  const setValue = (field: string, value: Values[string] | undefined) => setValues(current => {
    const next = { ...current }; if (value === undefined) delete next[field]; else next[field] = value; return next;
  });
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!result || busy || readOnly || !result.editable || invalidCaptain) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/football-fields", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ teamId, scope, activityId, personId, values: scope === "activity" && result.canManageInvitations ? { ...values, captainSource: source } : values, revision: result.revision }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Uppgifterna kunde inte sparas.");
      setResult(data); setValues(data.values); setSource((data.values.captainSource as PlayerSource) ?? "acceptedActivityPlayers"); setEditing(false); setNotice("Sparat.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Uppgifterna kunde inte sparas."); }
    finally { setBusy(false); }
  }
  if (result && !result.enabled) return null;
  function display(field: string) {
    const value = result?.values[field];
    if (value === undefined) return "Inte angivet";
    if (field === "captainPersonId") return [...(result?.teamPlayers ?? []), ...(result?.participants ?? [])].find(p => p.id === value)?.name ?? "Tidigare vald spelare";
    return Array.isArray(value) ? value.map(v => labels[v] ?? v).join(", ") || "Inte angivet" : labels[String(value)] ?? String(value);
  }
  return <section className="football-fields">
    <h3>{titles[scope]}</h3>
    {scope === "team" ? <p>Förval kopieras till nya matcher. Befintliga matcher påverkas inte.</p> : null}
    {error ? <p role="alert" className="auth-error">{error}</p> : null}
    {notice ? <p role="status" className="auth-message">{notice}</p> : null}
    {!result && !error ? <p role="status">Hämtar uppgifter…</p> : null}
    {error ? <button type="button" className="secondary" disabled={busy} onClick={() => { setNotice(""); setReload(n => n + 1); }}>Läs in senaste värden – ersätter osparade ändringar</button> : null}
    {result && !editing ? <>
      <dl className="football-values">{fields.map(field => { const schema = properties[field]; return <div key={field}><dt>{typeof schema === "object" ? schema.title : field}</dt><dd>{display(field)}</dd></div>; })}</dl>
      {result.editable && !readOnly ? <button type="button" className="secondary" onClick={() => { setEditing(true); setNotice(""); }}>Redigera {titles[scope].toLocaleLowerCase("sv")}</button> : null}
    </> : null}
    {result && editing ? <form onSubmit={save} className="application-form">
      <fieldset disabled={busy || readOnly || !result.editable} className="football-form-fields">
        {fields.map(field => {
          const schema = properties[field];
          if (typeof schema !== "object") return null;
          if (field === "positions") return <fieldset key={field}><legend>{schema.title}</legend>{footballPositions.map(position => <label className="settings-checkbox" key={position.id}><input type="checkbox" checked={Array.isArray(values.positions) && values.positions.includes(position.id)} onChange={event => setValue(field, event.target.checked ? [...(Array.isArray(values.positions) ? values.positions : []), position.id] : (Array.isArray(values.positions) ? values.positions : []).filter(id => id !== position.id))}/>{position.name}</label>)}</fieldset>;
          if (field === "captainPersonId") return <div key={field}>
            <label>Välj lagkapten från<select aria-label="Välj lagkapten från" value={source} onChange={event => setSource(event.target.value as PlayerSource)}><option value="acceptedActivityPlayers">Anmälda spelare till matchen</option><option value="teamPlayers">Lagets spelare</option></select></label>
            <label>Lagkapten<select aria-label="Lagkapten" value={String(values[field] ?? "")} onChange={event => setValue(field, event.target.value || undefined)}><option value="">Ingen vald</option>{invalidCaptain ? <option value={String(values[field])} disabled>Tidigare val är inte längre valbart</option> : null}{candidates.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
            {!candidates.length ? <p>Inga spelare i det valda urvalet.</p> : null}
            {invalidCaptain ? <p role="alert">Välj en annan spelare eller ta bort valet.</p> : null}
          </div>;
          return <label key={field}>{schema.title}{schema.enum ? <select aria-label={schema.title} value={String(values[field] ?? "")} onChange={event => setValue(field, event.target.value || undefined)}><option value="">Inte angivet</option>{schema.enum.map(option => <option key={String(option)} value={String(option)}>{labels[String(option)] ?? String(option)}</option>)}</select> : <input type="number" min={schema.minimum} max={schema.maximum} step={1} value={String(values[field] ?? "")} onChange={event => setValue(field, event.target.value === "" ? undefined : Number(event.target.value))}/>}</label>;
        })}
      </fieldset>
      <div className="football-actions"><button type="submit" className="primary" disabled={busy || invalidCaptain || readOnly || !result.editable}>{busy ? "Sparar…" : "Spara"}</button><button type="button" className="secondary" disabled={busy} onClick={() => { setValues(result.values); setSource((result.values.captainSource as PlayerSource) ?? "acceptedActivityPlayers"); setEditing(false); setError(""); }}>Avbryt</button></div>
    </form> : null}
    {scope === "activity" && result && result.participants.length ? <details className="settings-item"><summary>Spelarnas matchuppgifter</summary><label>Spelare<select aria-label="Spelare" value={selectedPlayer} onChange={event => setSelectedPlayer(event.target.value)}><option value="">Välj spelare</option>{result.participants.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>{selectedPlayer ? <FootballFields teamId={teamId} scope="activityParticipation" activityId={activityId} personId={selectedPlayer} readOnly={readOnly}/> : null}</details> : null}
  </section>;
}
