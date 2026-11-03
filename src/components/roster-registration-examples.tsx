"use client";

import { useId, useState } from "react";
import { RosterInvitationAcceptance, RosterLogin, RosterRegistration } from "./roster-registration";

export function RosterRegistrationExamples() {
  const id = useId();
  const [status, setStatus] = useState("queued");
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  return <section id="roster-registration-examples"><h2>Lägg till medlem och aktivera konto</h2>
    <p>Syntetiska uppgifter. Samma formulär som i medlemsadministrationen.</p>
    <label><input type="checkbox" checked={pending} onChange={event => setPending(event.target.checked)} />Sparande pågår</label>
    {message ? <p role="status">{message}</p> : null}
    <RosterRegistration today="2026-11-03" pending={pending} onSearch={async name => name.toLowerCase().includes("alex") ? [{ id: "example-alex", name: "Alex Andersson", birthDate: "2010-03-14" }] : []}
      onCreate={async value => setMessage(`${value.name} har lagts till som ${value.role === "leader" ? "ledare" : "spelare"}.`)} />
    <label htmlFor={id}>Leveransstatus</label><select id={id} value={status} onChange={event => setStatus(event.target.value)}>
      <option value="queued">Köad</option><option value="sent">Skickad</option><option value="failed">Leveransfel</option><option value="expired">Utgången</option><option value="accepted">Accepterad</option>
    </select>
    <RosterLogin key={status} email="alex@example.invalid" status={status} linked={status === "accepted"} pending={pending}
      onInvite={async () => { setStatus("queued"); setMessage("Inbjudan väntar på utskick."); }} />
    <RosterInvitationAcceptance personName="Alex Andersson" teamName="Ungdomslaget" email="alex@example.invalid" pending={pending}
      onAccept={() => setMessage("Inbjudan har accepterats.")} onDismiss={() => setMessage("Inbjudan stängdes.")} />
  </section>;
}
