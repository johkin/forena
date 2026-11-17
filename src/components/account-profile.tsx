"use client";

import type { NavigationLink } from "./navigation-link";
import { useEffect, useState } from "react";
import { z } from "zod";
import type { ParticipationFetch } from "./activity-invitation-response";
import { ActivityDatePicker } from "./activity-date-picker";
import { AccountProfileHistory } from "./account-profile-history";
import { ConfirmSubmit } from "./confirm-submit";

const personSchema = z.object({ id: z.uuid(), organizationId: z.uuid(), organizationName: z.string(), kind: z.enum(["self", "guardian"]), name: z.string(), birthDate: z.string().nullable(), phone: z.string(), contactEmail: z.string(), address: z.string(), revision: z.number(), editable: z.boolean(), linkGroup: z.uuid().nullable() });
const followerSchema = z.object({ id: z.uuid(), personId: z.uuid(), organizationId: z.uuid(), organizationName: z.string(), personName: z.string(), requester: z.string(), state: z.string(), incoming: z.boolean(), expiresAt: z.string(), teams: z.array(z.string()) });
export const accountProfileSchema = z.object({ profile: z.object({ name: z.string(), phone: z.string(), revision: z.number() }), email: z.string(), people: z.array(personSchema), clubs: z.array(z.object({ id: z.uuid(), name: z.string() })), deletionAt: z.string().nullable(), activated: z.boolean(), followers: z.array(followerSchema) });
export type AccountProfileData = z.infer<typeof accountProfileSchema>;
type AccountPerson = z.infer<typeof personSchema>;
const base = "/api/me/account";
export async function accountCommand(request: ParticipationFetch, path: string, method: string, body?: unknown) {
  const response = await request(base + path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) {
    if (response.status === 409) throw new Error("Underlaget har ändrats. Ditt utkast finns kvar. Läs in aktuella uppgifter och stäm av före nytt sparande.");
    if (response.status === 403) throw new Error("Du saknar åtkomst eller behöver verifiera din inloggning igen. Ditt utkast finns kvar.");
    throw new Error("Ändringen kunde inte sparas. Ditt utkast finns kvar. Kontrollera uppgifterna och försök igen.");
  }
  return response;
}
function versions(people: AccountPerson[]) { return Object.fromEntries(people.map(person => [person.id, person.revision])); }
function dateTime(value: string) { return new Date(value).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" }); }

/** The profile card follows the production Next profile's markup and shared CSS. */
export function AccountProfile({ request, linkComponent: Link = "a" }: { request: ParticipationFetch; linkComponent?: NavigationLink }) {
  const [data, setData] = useState<AccountProfileData>();
  const [error, setError] = useState<string>();
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void request(base, { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error("Ditt konto kunde inte hämtas.");
      const result = accountProfileSchema.parse(await response.json());
      if (!abort.signal.aborted) { setData(result); setError(undefined); }
    }).catch(() => { if (!abort.signal.aborted) setError("Ditt konto kunde inte hämtas. Försök igen."); });
    return () => abort.abort();
  }, [request, reload]);
  const refresh = () => setReload(value => value + 1);
  if (!data) return <section className="application-card profile-card"><h1>Mitt konto</h1>{error ? <p role="alert">{error}</p> : <p role="status">Hämtar ditt konto…</p>}<button className="secondary" onClick={refresh}>Försök igen</button></section>;
  const children = data.people.filter(person => person.kind === "guardian");
  return <section className="application-card profile-card">
    <div className="application-page-heading"><div><p className="eyebrow">Konto</p><h1>Mitt konto</h1><p>Hantera dina uppgifter och kopplingar i alla föreningar.</p></div><Link className="secondary" href="/">Tillbaka</Link></div>
    {data.deletionAt ? <div role="alert" className="auth-error"><h2>Ditt konto kommer att tas bort</h2><p>Du saknar klubbkoppling. Kontot tas bort {dateTime(data.deletionAt)}. En ny godkänd koppling före dess stoppar borttagningen. Du kan hantera ditt konto under tiden.</p></div> : !data.activated ? <p role="status">Kontot väntar på en godkänd klubbkoppling. Acceptera en personlig inbjudan för att få tillgång till föreningens verksamhet.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    <OwnProfile data={data} request={request} onSaved={refresh} />
    <div className="form-section"><h2>Föreningar</h2>{data.clubs.length ? <div className="profile-organizations">{data.clubs.map(club => <Link href={`/organizations/${club.id}`} key={club.id}>{club.name}<span aria-hidden="true">›</span></Link>)}</div> : <p>Du har inga aktiva klubbkopplingar.</p>}</div>
    <div className="form-section"><h2>Barnkopplingar</h2>{!children.length ? <p>Du har inga barnkopplingar.</p> : children.map(person => <ChildProfile key={person.id} person={person} people={children} request={request} onSaved={refresh} />)}</div>
    <ChildLinks people={children.filter(person => person.editable)} request={request} onSaved={refresh} />
    <Followers items={data.followers} request={request} onSaved={refresh} />
    <div className="form-section"><h2>Inloggning och integrationer</h2><div className="profile-organizations"><Link href="/account/security">Inloggningsinställningar, Telegram och push<span aria-hidden="true">›</span></Link><Link href="/connect">Anslut AI<span aria-hidden="true">›</span></Link></div></div>
  </section>;
}
function OwnProfile({ data, request, onSaved }: { data: AccountProfileData; request: ParticipationFetch; onSaved: () => void }) {
  const [draft, setDraft] = useState(data.profile);
  const [expected, setExpected] = useState({ revision: data.profile.revision, people: versions(data.people.filter(person => person.kind === "self")) });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const changed = expected.revision !== data.profile.revision || JSON.stringify(expected.people) !== JSON.stringify(versions(data.people.filter(person => person.kind === "self")));
  return <form className="application-form" onSubmit={event => { event.preventDefault(); if (pending) return; setPending(true); setError(undefined); setMessage(undefined); void accountCommand(request, "", "PUT", { name: draft.name, phone: draft.phone, ...expected }).then(() => { setExpected({ revision: expected.revision + 1, people: Object.fromEntries(Object.entries(expected.people).map(([id, revision]) => [id, revision + 1])) }); setMessage("Profilen har sparats."); onSaved(); }).catch(error => setError(error.message)).finally(() => setPending(false)); }}>
    <div className="form-section"><h2>Personuppgifter</h2>
      <label>Visningsnamn<input required maxLength={120} autoComplete="name" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>Telefonnummer<input type="tel" maxLength={80} autoComplete="tel" value={draft.phone} onChange={event => setDraft({ ...draft, phone: event.target.value })} /></label>
      <label>Inloggningsadress<input value={data.email} readOnly aria-readonly="true" /></label><p className="form-help">Byt inloggningsadress i inloggningsinställningarna. Ditt födelsedatum ändras av klubbadministrationen.</p>
      <p>Namnet och telefonnumret uppdateras också i: {data.people.filter(person => person.kind === "self").map(person => person.organizationName).join(", ") || "inga kopplade personposter"}. Barnens uppgifter påverkas inte.</p>
      {changed ? <div><p>Aktuellt konto: {data.profile.name}, {data.profile.phone}. Ditt utkast är bevarat.</p><ul>{data.people.filter(person => person.kind === "self").map(person => <li key={person.id}>{person.organizationName}: {person.name}, {person.phone}</li>)}</ul><button type="button" className="secondary" onClick={() => setExpected({ revision: data.profile.revision, people: versions(data.people.filter(person => person.kind === "self")) })}>Jag har stämt av, använd aktuell version</button></div> : null}
      {message ? <p role="status" className="auth-message">{message}</p> : null}{error ? <p role="alert" className="auth-error">{error}</p> : null}
      <button type="submit" className="primary application-submit" disabled={pending || changed}>{pending ? "Sparar…" : "Spara profil"}</button>
      {error ? <button type="button" className="secondary" onClick={onSaved}>Läs in aktuella uppgifter</button> : null}
    </div>
  </form>;
}
function ChildProfile({ person, people, request, onSaved }: { person: AccountPerson; people: AccountPerson[]; request: ParticipationFetch; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const affected = person.linkGroup ? people.filter(item => item.linkGroup === person.linkGroup && item.editable) : [person];
  const [draft, setDraft] = useState(person);
  const [expected, setExpected] = useState(versions(affected));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [history, setHistory] = useState(false);
  const changed = JSON.stringify(expected) !== JSON.stringify(versions(affected));
  async function act(path: string, method: string, body?: unknown) {
    if (pending) return;
    setPending(true); setError(undefined); setMessage(undefined);
    try { await accountCommand(request, path, method, body); setMessage("Ändringen har sparats."); setEditing(false); setHistory(false); onSaved(); }
    catch (error) { setError(error instanceof Error ? error.message : "Ändringen misslyckades."); }
    finally { setPending(false); }
  }
  return <article className="form-section"><h3>{person.name}</h3><p>{person.organizationName}</p>
    {!person.editable ? <><p>Din vårdnadshavaråtkomst har upphört. Klubben behöver rätta ett felaktigt födelsedatum. Du kan be den myndiga personen godkänna att du följer matcherna.</p><button type="button" className="secondary" disabled={pending} onClick={() => void act(`/children/${person.id}/follower`, "POST")}>Begär följaråtkomst</button><GuardianProposal person={person} request={request} correction /></> : <>
      {!editing ? <button className="secondary" onClick={() => { setDraft(person); setExpected(versions(affected)); setEditing(true); }}>Redigera barnets uppgifter</button> : <form className="application-form" onSubmit={event => { event.preventDefault(); void act(`/children/${person.id}`, "PUT", { name: draft.name, birthDate: draft.birthDate || null, phone: draft.phone, contactEmail: draft.contactEmail, address: draft.address, people: expected }); }}>
        <label>Namn<input required maxLength={120} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        <ActivityDatePicker label="Födelsedatum" value={draft.birthDate ?? ""} onChange={value => setDraft({ ...draft, birthDate: value || null })} />
        <label>Telefonnummer<input type="tel" maxLength={80} value={draft.phone} onChange={event => setDraft({ ...draft, phone: event.target.value })} /></label>
        <label>Kontaktadress (e-post)<input type="email" maxLength={320} value={draft.contactEmail} onChange={event => setDraft({ ...draft, contactEmail: event.target.value })} /></label>
        <label>Adress<textarea maxLength={1000} value={draft.address} onChange={event => setDraft({ ...draft, address: event.target.value })} /></label>
        <p>Uppdaterar barnets uppgifter i {affected.map(item => item.organizationName).join(", ")}. Inloggning och medlemskap påverkas inte. Ett nytt födelsedatum kan avsluta din vårdnadshavaråtkomst direkt.</p>
        {changed ? <><p>Aktuella uppgifter i berörda föreningar. Ditt utkast är bevarat.</p><ul>{affected.map(current => <li key={current.id}>{current.organizationName}: {current.name}, {current.birthDate}, {current.phone}, {current.contactEmail}, {current.address}</li>)}</ul><button type="button" className="secondary" onClick={() => setExpected(versions(affected))}>Jag har stämt av, använd aktuell version</button></> : null}
        <button className="primary" disabled={pending || changed}>Spara barnets uppgifter</button><button type="button" className="secondary" onClick={() => setEditing(false)}>Avbryt</button>
      </form>}
      <button className="secondary" disabled={pending} onClick={() => setHistory(true)}>Visa ändringshistorik</button>
      {history ? <AccountProfileHistory path={`${base}/children/${person.id}/history`} request={request} /> : null}
      <GuardianProposal person={person} request={request} />
    </>}
    {error ? <><p role="alert" className="auth-error">{error}</p><button className="secondary" onClick={onSaved}>Läs in aktuella uppgifter</button></> : null}{message ? <p role="status">{message}</p> : null}
  </article>;
}
function GuardianProposal({ person, request, correction = false }: { person: AccountPerson; request: ParticipationFetch; correction?: boolean }) {
  const [email, setEmail] = useState("");
  const [operation, setOperation] = useState("add");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  return <details><summary>{correction ? "Begär rättelse från klubben" : "Föreslå ändring av vårdnadshavare"}</summary><form className="application-form" onSubmit={event => { event.preventDefault(); if (pending) return; setPending(true); setError(undefined); void accountCommand(request, `/children/${person.id}/proposals`, "POST", { email, operation: correction ? "birth-date-correction" : operation }).then(() => setMessage("Förslaget har skickats till klubben. Ingen relation eller åtkomst har ändrats.")).catch(error => setError(error.message)).finally(() => setPending(false)); }}>
    <label>{correction ? "Din e-postadress för återkoppling" : "Vårdnadshavarens inloggningsadress"}<input required type="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
    {!correction ? <label>Ändring<select value={operation} onChange={event => setOperation(event.target.value)}><option value="add">Lägg till</option><option value="remove">Ta bort</option></select></label> : null}
    <p>Klubben måste godkänna ändringen. Förslaget ger ingen ny åtkomst.</p><button className="secondary" disabled={pending}>Skicka förslag</button>{message ? <p role="status">{message}</p> : null}{error ? <p role="alert">{error}</p> : null}
  </form></details>;
}
function ChildLinks({ people, request, onSaved }: { people: AccountPerson[]; request: ParticipationFetch; onSaved: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const groups = [...new Set(people.flatMap(person => person.linkGroup ? [person.linkGroup] : []))];
  async function save(path: string, method: string, body?: unknown) {
    if (pending) return; setPending(true); setError(undefined);
    try { await accountCommand(request, path, method, body); setSelected([]); onSaved(); }
    catch (error) { setError(error instanceof Error ? error.message : "Ändringen misslyckades."); }
    finally { setPending(false); }
  }
  if (people.length < 2 && !groups.length) return null;
  return <div className="form-section"><h2>Samma barn i flera föreningar</h2><p>Välj endast poster som gäller samma barn. Du bekräftar att framtida ändringar ska sparas tillsammans. Kopplingen ger inga nya rättigheter.</p>
    <form onSubmit={event => { event.preventDefault(); void save("/child-links", "POST", { people: selected }); }}>{people.map(person => <label key={person.id}><input type="checkbox" checked={selected.includes(person.id)} onChange={event => setSelected(current => event.target.checked ? [...current, person.id] : current.filter(id => id !== person.id))} />{person.name} · {person.organizationName}</label>)}<ConfirmSubmit variant="primary" label="Bekräfta samma barn" message="Bekräftar du att de valda posterna gäller samma barn?" disabled={pending || selected.length < 2} /></form>
    {groups.map(group => <form key={group} onSubmit={event => { event.preventDefault(); void save(`/child-links/${group}`, "DELETE"); }}><p>{people.filter(person => person.linkGroup === group).map(person => `${person.name} · ${person.organizationName}`).join(", ")}</p><ConfirmSubmit label="Bryt sammankoppling" message="Stoppa gemensamma uppdateringar? Klubbarnas uppgifter, historik och godkända åtkomst behålls." disabled={pending} /></form>)}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
function Followers({ items, request, onSaved }: { items: AccountProfileData["followers"]; request: ParticipationFetch; onSaved: () => void }) {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [matches, setMatches] = useState<{ id: string; title: string; startsAt: string; location: string; result: string | null }[]>();
  async function decide(id: string, state: string) { if (pending) return; setPending(true); setError(undefined); try { await accountCommand(request, `/followers/${id}`, "PUT", { state }); setMatches(undefined); onSaved(); } catch (error) { setError(error instanceof Error ? error.message : "Ändringen misslyckades."); } finally { setPending(false); } }
  if (!items.length) return null;
  return <div className="form-section"><h2>Följaråtkomst</h2><p>Ger endast läsning av lagens publicerade matcher, utan personliga kallelser, svar eller närvaro.</p>{items.map(item => <article key={item.id}><h3>{item.personName} · {item.organizationName}</h3><p>{item.teams.join(", ") || "Inga aktuella lag"}</p><p>{item.incoming ? `${item.requester} vill följa dina matcher.` : "Din förfrågan"} {item.state === "pending" ? `Väntar på svar till ${dateTime(item.expiresAt)}.` : "Godkänd."}</p>
    {item.incoming && item.state === "pending" ? <><button className="primary" disabled={pending} onClick={() => void decide(item.id, "approved")}>Godkänn i denna förening</button><button className="secondary" disabled={pending} onClick={() => void decide(item.id, "denied")}>Neka</button></> : null}
    {item.state === "approved" ? <><button className="danger" disabled={pending} onClick={() => void decide(item.id, "revoked")}>Återkalla följaråtkomst</button>{!item.incoming ? <button className="secondary" onClick={() => void request(`${base}/followers/${item.id}/matches`).then(async response => { if (!response.ok) throw new Error(); setMatches(z.array(z.object({ id: z.uuid(), title: z.string(), startsAt: z.string(), location: z.string(), result: z.string().nullable() })).parse(await response.json())); }).catch(() => { setMatches(undefined); setError("Matcherna kunde inte hämtas. Åtkomsten kan ha upphört."); })}>Visa matcher</button> : null}</> : null}
  </article>)}{matches ? <ul>{matches.map(match => <li key={match.id}>{match.title} · {dateTime(match.startsAt)} · {match.location} · {match.result ?? "Resultat ej registrerat"}</li>)}{!matches.length ? <li>Inga publicerade matcher.</li> : null}</ul> : null}{error ? <p role="alert">{error}</p> : null}</div>;
}
