"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import type { ParticipationFetch } from "./activity-invitation-response";
import { accountCommand } from "./account-profile";
import { ConfirmSubmit } from "./confirm-submit";

const sessionsSchema = z.array(z.object({ id: z.string(), device: z.string(), lastActiveAt: z.string(), current: z.boolean() }));
export function AccountSecurity({ request, onPasskeyVerify, onSessionRevoked }: { request: ParticipationFetch; onPasskeyVerify: () => Promise<void>; onSessionRevoked: () => void }) {
  const [password, setPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [email, setEmail] = useState("");
  const [sessionError, setSessionError] = useState<string>();
  const [sessions, setSessions] = useState<z.infer<typeof sessionsSchema>>();
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    const abort = new AbortController();
    void request("/api/me/account/sessions", { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const data = sessionsSchema.parse(await response.json());
      if (!abort.signal.aborted) { setSessions(data); setSessionError(undefined); }
    }).catch(() => { if (!abort.signal.aborted) setSessionError("Sessionerna kunde inte hämtas."); });
    return () => abort.abort();
  }, [request, reload]);
  async function action(task: () => Promise<unknown>, success: string) {
    if (pending) return;
    setPending(true); setError(undefined); setMessage(undefined);
    try { await task(); setMessage(success); setReload(value => value + 1); }
    catch (error) { setError(error instanceof Error ? error.message : "Ändringen kunde inte genomföras."); }
    finally { setPassword(""); setNextPassword(""); setPending(false); }
  }
  return <section className="application-card profile-card"><div className="application-page-heading"><div><p className="eyebrow">Konto</p><h1>Inloggningsinställningar</h1></div><a className="secondary" href="/account">Mitt konto</a></div>
    <div className="form-section"><h2>Verifiera din inloggning</h2><p>Bekräfta med lösenord eller passkey innan du ändrar inloggningsadress, lösenord eller passkeys. Verifieringen gäller i fem minuter.</p>
      <form className="application-form" onSubmit={event => { event.preventDefault(); void action(() => accountCommand(request, "/reauthenticate", "POST", { password }), "Inloggningen är verifierad i fem minuter."); }}><label>Nuvarande lösenord<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label><button className="primary" disabled={pending}>Verifiera med lösenord</button></form>
      <button className="secondary" disabled={pending} onClick={() => void action(onPasskeyVerify, "Inloggningen är verifierad i fem minuter.")}>Verifiera med passkey</button>
    </div>
    <form className="application-form form-section" onSubmit={event => { event.preventDefault(); void action(() => accountCommand(request, "/email", "POST", { email }), "Verifieringslänken har skickats till din nya adress och gäller i 30 minuter. Din gamla adress gäller tills du bekräftat länken i denna webbläsare."); }}>
      <h2>Byt inloggningsadress</h2><label>Ny e-postadress<input type="email" autoComplete="email" maxLength={320} required value={email} onChange={event => setEmail(event.target.value)} /></label><p>En ny begäran ersätter tidigare länkar. Andra sessioner loggas ut när bytet är klart.</p><button className="primary" disabled={pending}>Skicka verifieringslänk</button><button type="button" className="secondary" disabled={pending} onClick={() => void action(() => accountCommand(request, "/email", "DELETE"), "E-postbytet har avbrutits. Tidigare länk kan inte längre användas.")}>Avbryt pågående e-postbyte</button>
    </form>
    <form className="application-form form-section" onSubmit={event => { event.preventDefault(); void action(() => accountCommand(request, "/password", "PUT", { password: nextPassword }), "Lösenordet har ändrats. Andra sessioner har loggats ut."); }}>
      <h2>Byt lösenord</h2><label>Nytt lösenord<input type="password" required minLength={12} autoComplete="new-password" value={nextPassword} onChange={event => setNextPassword(event.target.value)} /></label><p>Minst 12 tecken och högst 72 byte. Andra sessioner loggas ut.</p><button className="primary" disabled={pending}>Spara nytt lösenord</button>
    </form>
    <div className="form-section"><h2>Aktiva sessioner</h2><p>Du kan logga ut sessioner direkt utan ny verifiering.</p>{sessionError ? <p role="alert">{sessionError}</p> : null}{!sessions ? sessionError ? null : <p role="status">Hämtar sessioner…</p> : sessions.map(session => <form key={session.id} onSubmit={event => { event.preventDefault(); void action(async () => { await accountCommand(request, `/sessions/${session.id}`, "DELETE"); if (session.current) onSessionRevoked(); }, "Sessionen har loggats ut."); }}><p>{session.device}{session.current ? " · Denna session" : ""}<br />Senast aktiv {new Date(session.lastActiveAt).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" })}</p><ConfirmSubmit label="Logga ut session" message={session.current ? "Logga ut denna session?" : "Logga ut den valda sessionen?"} disabled={pending} /></form>)}<button className="secondary" disabled={pending} onClick={() => void action(() => accountCommand(request, "/sessions", "DELETE"), "Alla andra sessioner har loggats ut.")}>Logga ut alla andra sessioner</button><button className="secondary" disabled={pending} onClick={() => { setError(undefined); setReload(value => value + 1); }}>Uppdatera sessioner</button></div>
    {message ? <p role="status" className="auth-message">{message}</p> : null}{error ? <p role="alert" className="auth-error">{error}</p> : null}
  </section>;
}
export function AccountEmailConfirmation({ request, onConfirmed, code: providedCode }: { request: ParticipationFetch; onConfirmed: () => void; code?: string }) {
  const [code] = useState(() => providedCode ?? new URLSearchParams(window.location.search).get("code"));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  useEffect(() => { if (providedCode === undefined) window.history.replaceState(window.history.state, "", window.location.pathname); }, [providedCode]);
  return <section className="application-card profile-card"><h1>Bekräfta ny inloggningsadress</h1><p>Öppna länken i samma webbläsare och konto som begärde bytet. Andra sessioner loggas ut när du bekräftar.</p>{done ? <p role="status">Adressen har ändrats. Den gamla adressen får ett säkerhetsmeddelande.</p> : <button className="primary" disabled={pending || !code} onClick={() => { setPending(true); void accountCommand(request, "/email/confirm", "POST", { code }).then(() => { setDone(true); onConfirmed(); }).catch(error => setError(error.message)).finally(() => setPending(false)); }}>Bekräfta adressbyte</button>}{!code ? <p role="alert">Länken saknas. Begär en ny från inloggningsinställningarna.</p> : null}{error ? <p role="alert">{error}</p> : null}<a href="/account/security">Till inloggningsinställningar</a></section>;
}
