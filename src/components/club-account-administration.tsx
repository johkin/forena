"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import type { ParticipationFetch } from "./activity-invitation-response";
import { AccountProfileHistory } from "./account-profile-history";
import { ActivityDatePicker } from "./activity-date-picker";
const schema = z.object({ people: z.array(z.object({ id: z.uuid(), name: z.string(), birthDate: z.string().nullable(), revision: z.number() })), proposals: z.array(z.object({ id: z.uuid(), personId: z.uuid(), email: z.string(), operation: z.string(), state: z.string() })) });
export function ClubAccountAdministration({ teamId, request }: { teamId: string; request: ParticipationFetch }) {
  const [data, setData] = useState<z.infer<typeof schema>>();
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const [history, setHistory] = useState<string>();
  const [offset, setOffset] = useState(0);
  const base = `/api/teams/${teamId}/account-administration`;
  useEffect(() => {
    const abort = new AbortController();
    void request(base + (offset ? `?offset=${offset}` : ""), { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const result = schema.parse(await response.json());
      if (!abort.signal.aborted) setData(result);
    }).catch(() => { if (!abort.signal.aborted) setError("Kontouppgifterna kunde inte hämtas."); });
    return () => abort.abort();
  }, [request, base, revision, offset]);
  async function write(path: string, body: unknown) {
    if (pending) return; setPending(true); setError(undefined); setMessage(undefined);
    try {
      const response = await request(base + path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error("Ändringen kunde inte sparas. Behörigheten eller underlaget kan ha ändrats. Ditt utkast finns kvar.");
      setMessage("Ändringen har sparats."); setHistory(undefined); setRevision(value => value + 1);
    } catch (error) { setError(error instanceof Error ? error.message : "Ändringen misslyckades."); }
    finally { setPending(false); }
  }
  return <details className="form-section"><summary>Personuppgifter och vårdnadshavarförslag</summary>
    {error ? <p role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
    {!data ? <p>Öppna och uppdatera för att hämta klubbens underlag.</p> : <>
      <h2>Förslag att granska</h2>{data.proposals.filter(item => item.state === "pending").map(item => <article key={item.id}><h3>{data.people.find(person => person.id === item.personId)?.name}</h3><p>{item.operation === "add" ? "Lägg till vårdnadshavare" : item.operation === "remove" ? "Ta bort vårdnadshavare" : "Begäran om rättelse av födelsedatum"}: {item.email}</p>{item.operation !== "birth-date-correction" ? <button className="primary" disabled={pending} onClick={() => { if (window.confirm("Godkänna ändringen av vårdnadshavaråtkomst?")) void write(`/proposals/${item.id}`, { approve: true }); }}>Godkänn</button> : <p>Rätta födelsedatum nedan och avsluta sedan förfrågan.</p>}<button className="secondary" disabled={pending} onClick={() => void write(`/proposals/${item.id}`, { approve: false })}>{item.operation === "birth-date-correction" ? "Avsluta förfrågan" : "Avslå"}</button></article>)}
      {!data.proposals.some(item => item.state === "pending") ? <p>Inga väntande förslag.</p> : null}
      {offset > 0 ? <button className="secondary" onClick={() => setOffset(value => Math.max(0, value - 100))}>Nyare förslag</button> : null}
      {data.proposals.length === 100 ? <button className="secondary" onClick={() => setOffset(value => value + 100)}>Äldre förslag</button> : null}
      <h2>Födelsedatum och historik</h2>{data.people.map(person => <BirthDateEditor key={`${person.id}:${person.revision}`} person={person} pending={pending} onSave={birthDate => void write(`/people/${person.id}/birth-date`, { birthDate: birthDate || null, revision: person.revision })} onHistory={() => setHistory(person.id)} />)}
      {history ? <AccountProfileHistory key={history} path={`${base}/people/${history}/history`} request={request} /> : null}
    </>}<button className="secondary" disabled={pending} onClick={() => { setError(undefined); setRevision(value => value + 1); }}>Uppdatera underlag</button>
  </details>;
}
function BirthDateEditor({ person, pending, onSave, onHistory }: { person: z.infer<typeof schema>["people"][number]; pending: boolean; onSave: (date: string) => void; onHistory: () => void }) {
  const [date, setDate] = useState(person.birthDate ?? "");
  return <form className="application-form form-section" onSubmit={event => { event.preventDefault(); onSave(date); }}><h3>{person.name}</h3><ActivityDatePicker value={date} onChange={setDate} label="Födelsedatum" /><p>Ändringen loggas och åldersstyrd åtkomst räknas om direkt.</p><button className="primary" disabled={pending}>Spara födelsedatum</button><button type="button" className="secondary" onClick={onHistory}>Visa profilhistorik</button></form>;
}
