"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { ParticipationFetch } from "./activity-invitation-response";

const valueSchema = z.union([z.string(), z.number(), z.array(z.string())]);
const fieldSchema = z.object({ key: z.string(), title: z.string(), type: z.enum(["integer", "choice", "choices", "player"]),
  minimum: z.number().nullable(), maximum: z.number().nullable(), options: z.array(z.object({ id: z.string(), name: z.string() })) });
const playerSchema = z.object({ id: z.uuid(), name: z.string() });
const snapshotSchema = z.object({ disciplineKey: z.string(), version: z.string().nullable(), enabled: z.boolean(), editable: z.boolean(),
  canManageInvitations: z.boolean(), title: z.string(), fields: z.array(fieldSchema), values: z.record(z.string(), valueSchema), revision: z.number(),
  teamPlayers: z.array(playerSchema), acceptedPlayers: z.array(playerSchema), participants: z.array(playerSchema) });
type Values = z.infer<typeof snapshotSchema>["values"];
type Props = { request: ParticipationFetch; teamId: string; scope: "team" | "teamMembership" | "activity" | "activityParticipation"; activityId?: string; personId?: string };

/** Shared production editor. Only server-authorized field definitions and values reach this view. */
export function ExtensionFields(props: Props) {
  return <Editor key={`${props.teamId}:${props.scope}:${props.activityId ?? ""}:${props.personId ?? ""}`} {...props} />;
}

function Editor({ request, teamId, scope, activityId, personId }: Props) {
  const [data, setData] = useState<z.infer<typeof snapshotSchema>>();
  const [values, setValues] = useState<Values>({});
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const writing = useRef(false);
  const active = useRef(true);
  const query = new URLSearchParams({ teamId, scope, ...(activityId ? { activityId } : {}), ...(personId ? { personId } : {}) });
  const url = `/api/discipline-fields?${query}`;
  useEffect(() => {
    const controller = new AbortController();
    active.current = true;
    request(url, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Disciplinuppgifterna kunde inte hämtas.");
      return snapshotSchema.parse(await response.json());
    }).then(snapshot => { if (!controller.signal.aborted) { setData(snapshot); setValues(snapshot.values); setEditing(false); setError(undefined); } })
      .catch(() => { if (!controller.signal.aborted) setError("Disciplinuppgifterna kunde inte hämtas. Försök igen."); });
    return () => { active.current = false; controller.abort(); };
  }, [request, url, attempt]);
  const update = (key: string, value?: Values[string]) => setValues(current => {
    const next = { ...current }; if (value === undefined) delete next[key]; else next[key] = value; return next;
  });
  const candidates = values.captainSource === "teamPlayers" ? data?.teamPlayers ?? [] : data?.acceptedPlayers ?? [];
  const invalidPlayer = data?.fields.some(field => field.type === "player" && values[field.key] !== undefined && !candidates.some(p => p.id === values[field.key]));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!data || !data.editable || writing.current || invalidPlayer) return;
    writing.current = true; setBusy(true); setError(undefined); setNotice(undefined);
    try {
      const response = await request("/api/discipline-fields", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, scope, activityId, personId, disciplineKey: data.disciplineKey, version: data.version, revision: data.revision, values }) });
      if (!response.ok) {
        const problem = z.object({ error: z.string() }).safeParse(await response.json().catch(() => null));
        throw new Error(problem.success ? problem.data.error : "Uppgifterna kunde inte sparas. Ditt utkast finns kvar.");
      }
      const snapshot = snapshotSchema.parse(await response.json());
      if (active.current) { setData(snapshot); setValues(snapshot.values); setEditing(false); setNotice("Sparat."); }
    } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : "Uppgifterna kunde inte sparas."); }
    finally { writing.current = false; if (active.current) setBusy(false); }
  }
  if (data && !data.enabled) return null;
  return <section className="discipline-fields"><h3>{data?.title ?? "Disciplinuppgifter"}</h3>
    {scope === "team" ? <p>Förval kopieras till nya matcher. Befintliga matcher påverkas inte.</p> : null}
    {error ? <p role="alert">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
    {!data && !error ? <p role="status">Hämtar uppgifter…</p> : null}
    {error ? <button type="button" className="secondary" disabled={busy} onClick={() => setAttempt(n => n + 1)}>Läs in senaste värden – ersätter osparade ändringar</button> : null}
    {data && !editing ? <><dl className="discipline-values">{data.fields.filter(f => f.key !== "captainSource").map(field => {
      const value = data.values[field.key];
      const label = (value: string | number) => field.options.find(option => option.id === String(value))?.name ??
        (field.type === "player" ? [...data.teamPlayers, ...data.participants].find(person => person.id === value)?.name ?? "Tidigare vald spelare" : String(value));
      return <div key={field.key}><dt>{field.title}</dt><dd>{value === undefined ? "Inte angivet" : Array.isArray(value) ? value.map(label).join(", ") || "Inte angivet" : label(value)}</dd></div>;
    })}</dl>{data.editable ? <button type="button" className="secondary" onClick={() => { setEditing(true); setNotice(undefined); }}>Redigera {data.title.toLocaleLowerCase("sv")}</button> : null}</> : null}
    {data && editing ? <form className="application-form" onSubmit={save}><fieldset disabled={busy} className="discipline-form-fields">
      {data.fields.map(field => {
        const value = values[field.key];
        if (field.type === "choices") return <fieldset key={field.key}><legend>{field.title}</legend>{field.options.map(option =>
          <label className="settings-checkbox" key={option.id}><input type="checkbox" checked={Array.isArray(value) && value.includes(option.id)} onChange={event =>
            update(field.key, event.target.checked ? [...(Array.isArray(value) ? value : []), option.id] : (Array.isArray(value) ? value : []).filter(v => v !== option.id))} />{option.name}</label>)}</fieldset>;
        return <label key={field.key}>{field.title}{field.type === "integer" ? <input type="number" step={1} min={field.minimum ?? undefined} max={field.maximum ?? undefined} value={String(value ?? "")}
          onChange={event => update(field.key, event.target.value === "" ? undefined : Number(event.target.value))} /> : <select value={String(value ?? "")} onChange={event => update(field.key, event.target.value || undefined)}>
          <option value="">Inte angivet</option>{field.type === "player" ? <>{value && !candidates.some(p => p.id === value) ? <option value={String(value)} disabled>Tidigare val är inte längre valbart</option> : null}{candidates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</> : field.options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>}</label>;
      })}
      {invalidPlayer ? <p role="alert">Välj en annan spelare eller ta bort valet.</p> : null}
    </fieldset><div className="discipline-actions"><button className="primary" disabled={busy || invalidPlayer}>{busy ? "Sparar…" : "Spara"}</button>
      <button type="button" className="secondary" disabled={busy} onClick={() => { setValues(data.values); setEditing(false); setError(undefined); }}>Avbryt</button></div></form> : null}
    {scope === "activity" && data?.participants.length ? <details><summary>Spelarnas matchuppgifter</summary><label>Spelare<select value={selectedPlayer} onChange={event => setSelectedPlayer(event.target.value)}><option value="">Välj spelare</option>{data.participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      {selectedPlayer ? <ExtensionFields request={request} teamId={teamId} scope="activityParticipation" activityId={activityId} personId={selectedPlayer} /> : null}</details> : null}
  </section>;
}
