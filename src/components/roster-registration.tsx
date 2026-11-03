"use client";

import { useId, useRef, useState } from "react";

export type RosterCandidate = { id: string; name: string; birthDate: string | null };
export type RosterRegistrationValue = {
  requestId: string; personId?: string; name: string; birthDate?: string;
  role: string; startsOn: string; email: string; duplicatesConfirmed: boolean;
};

export function RosterRegistration({ today, pending = false, onSearch, onCreate }: {
  today: string; pending?: boolean;
  onSearch: (query: string) => Promise<RosterCandidate[]>;
  onCreate: (value: RosterRegistrationValue) => Promise<void>;
}) {
  const id = useId();
  const [name, setName] = useState("");
  const [candidates, setCandidates] = useState<RosterCandidate[]>();
  const [selected, setSelected] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string>();
  const revision = useRef(0);
  const [requestId] = useState(() => crypto.randomUUID());
  return <details className="squad-create"><summary>+ Lägg till medlem</summary>
    <form className="squad-form" onSubmit={event => {
      event.preventDefault();
      if (pending || searching || candidates === undefined) return;
      const form = new FormData(event.currentTarget);
      void onCreate({ requestId, personId: selected || undefined, name,
        birthDate: selected ? undefined : String(form.get("birthDate") || "") || undefined,
        role: String(form.get("role")), startsOn: String(form.get("startsOn")),
        email: String(form.get("email") || ""), duplicatesConfirmed: form.get("duplicatesConfirmed") === "on" });
    }}>
      <fieldset className="squad-fieldset" disabled={pending}>
        <h2>Lägg till spelare eller ledare</h2>
        <label>Namn eller sök befintlig person<input value={name} minLength={2} maxLength={160} required onChange={event => {
          revision.current++; setName(event.target.value); setCandidates(undefined); setSelected(""); setSearching(false); setError(undefined);
        }} autoComplete="name" /></label>
        <button type="button" className="secondary" disabled={name.trim().length < 2 || searching} onClick={() => {
          const expected = ++revision.current;
          setSearching(true); setError(undefined);
          void onSearch(name.trim()).then(rows => { if (revision.current === expected) setCandidates(rows); })
            .catch(() => { if (revision.current === expected) setError("Personer kunde inte hämtas. Försök igen."); })
            .finally(() => { if (revision.current === expected) setSearching(false); });
        }}>{searching ? "Söker…" : "Sök i föreningen"}</button>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        {candidates ? <>
          <div className="squad-select-field"><label htmlFor={`${id}-person`}>Person</label><select id={`${id}-person`} value={selected} onChange={event => setSelected(event.target.value)}>
            <option value="">Registrera en ny person</option>
            {candidates.map(person => <option value={person.id} key={person.id}>{person.name}{person.birthDate ? ` · ${person.birthDate}` : ""}</option>)}
          </select></div>
          {!selected ? <label className="squad-checkbox"><input type="checkbox" name="duplicatesConfirmed" required={candidates.length > 0} />Jag har kontrollerat möjliga dubbletter och vill skapa en ny person.</label> : null}
          {!candidates.length ? <p className="form-help">Inga personer matchar sökningen.</p> : null}
        </> : <p className="form-help">Sök först för att undvika att registrera samma person flera gånger.</p>}
        {!selected ? <label>Födelsedatum (valfritt)<input name="birthDate" type="date" max={today} /></label> : null}
        <div className="squad-select-field"><label htmlFor={`${id}-role`}>Roll</label><select id={`${id}-role`} name="role" defaultValue="participant"><option value="participant">Spelare</option><option value="leader">Ledare</option></select></div>
        <label>Startdatum<input name="startsOn" type="date" required min={today} defaultValue={today} /></label>
        <label>Egen e-postadress (valfritt)<input name="email" type="email" maxLength={320} autoComplete="email" /></label>
        <p className="form-help">Personen sparas i laget även utan konto. Ange personens egen e-post för att bjuda in till inloggning. Barn utan egen e-post kan finnas utan eget konto. Befintliga konton behåller sin inloggningsadress. En ledarroll ger inga administrativa behörigheter.</p>
        <button type="submit" className="primary" disabled={candidates === undefined || searching}>{pending ? "Sparar…" : "Lägg till medlem"}</button>
      </fieldset>
    </form>
  </details>;
}

const statuses: Record<string, string> = {
  queued: "Inbjudan väntar på utskick.", sent: "E-postleverantören har accepterat utskicket. Väntar på mottagarens acceptans.",
  failed: "Inbjudan kunde inte skickas. Skicka en ny inbjudan.", expired: "Inbjudan har gått ut. Skicka en ny inbjudan.",
  revoked: "Inbjudan är återkallad.", accepted: "Konto kopplat.",
};
export function RosterLogin({ email, linked, status, pending = false, onInvite }: {
  email?: string | null; linked: boolean; status?: string | null; pending?: boolean;
  onInvite: (email: string) => Promise<void>;
}) {
  const [address, setAddress] = useState(email ?? "");
  return <section className="squad-section"><h3>Inloggning</h3>
    <p role="status">{status ? statuses[status] : linked ? "Konto kopplat." : "Inget eget konto kopplat."}</p>
    {linked ? <p>{email}</p> : <form className="squad-form" onSubmit={event => { event.preventDefault(); if (!pending) void onInvite(address); }}>
      <fieldset className="squad-fieldset" disabled={pending}>
        <label>Egen e-postadress<input type="email" value={address} onChange={event => setAddress(event.target.value)} required maxLength={320} autoComplete="email" /></label>
        <p className="form-help">Mottagaren verifierar sin egen adress, loggar in och accepterar inbjudan. En ny inbjudan ersätter den tidigare. Vänta minst en minut mellan utskick.</p>
        <button type="submit" className="primary">{pending ? "Sparar…" : status ? "Skicka ny inbjudan" : "Skicka inbjudan"}</button>
      </fieldset>
    </form>}
  </section>;
}

export function RosterInvitationAcceptance({ personName, teamName, email, pending = false, error, onAccept, onDismiss }: {
  personName: string; teamName: string; email: string; pending?: boolean; error?: string;
  onAccept: () => void; onDismiss: () => void;
}) {
  return <section className="application-card"><h2>Acceptera laginbjudan</h2>
    <p>Koppla kontot {email} till {personName} i {teamName}.</p>
    {error ? <p className="auth-error" role="alert">{error}</p> : null}
    <div className="squad-save-bar"><button type="button" className="primary" disabled={pending} onClick={onAccept}>{pending ? "Kopplar konto…" : "Acceptera inbjudan"}</button>
      <button type="button" className="secondary" disabled={pending} onClick={onDismiss}>Avbryt</button></div>
  </section>;
}
