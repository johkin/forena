"use client";
import { useId } from "react";

export type AccountAction = "register" | "forgot" | "reset";
export function AccountForm({ action, onSubmit, pending = false, message, error }: {
  action: AccountAction; onSubmit: (value: { email: string; password: string }) => void;
  pending?: boolean; message?: string; error?: string;
}) {
  const id = useId();
  const title = action === "register" ? "Skapa konto" : action === "forgot" ? "Återställ lösenord" : "Välj ett nytt lösenord";
  return <section className="auth-card"><h1>{title}</h1>
    <p>{action === "register" ? "Verifiera din e-postadress i samma webbläsare innan du loggar in. Ett nytt konto ger ingen föreningsåtkomst automatiskt." : "Du får en engångslänk till kontots e-postadress. Länken gäller i tio minuter."}</p>
    <form className="auth-form" onSubmit={event => {
      event.preventDefault(); if (pending) return;
      const data = new FormData(event.currentTarget);
      onSubmit({ email: String(data.get("email") ?? ""), password: String(data.get("password") ?? "") });
    }}>
      {action !== "reset" ? <><label htmlFor={`${id}-email`}>E-postadress</label><input id={`${id}-email`} name="email" type="email" autoComplete="email" required disabled={pending} /></> : null}
      {action !== "forgot" ? <><label htmlFor={`${id}-password`}>Nytt lösenord</label><input id={`${id}-password`} name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required disabled={pending} /><p className="auth-muted">Minst 12 tecken och högst 72 byte. Vissa tecken, som emoji, tar flera byte.</p></> : null}
      {message ? <p className="auth-message" role="status">{message}</p> : null}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <button className="primary" disabled={pending} type="submit">{pending ? "Arbetar…" : action === "forgot" ? "Skicka återställningslänk" : title}</button>
      <a href="/login">Till inloggningen</a>
    </form>
  </section>;
}

export function EmailVerification({ onVerify, pending = false, verified = false, error }: {
  onVerify: () => void; pending?: boolean; verified?: boolean; error?: string;
}) {
  return <section className="auth-card"><h1>Verifiera e-post</h1><p>Bekräfta att e-postadressen tillhör dig.</p><div className="auth-form">
    {verified ? <p className="auth-message" role="status">E-postadressen är verifierad. Du kan nu logga in.</p> : <button className="primary" type="button" onClick={onVerify} disabled={pending}>{pending ? "Verifierar…" : "Verifiera e-postadress"}</button>}
    {error ? <p className="auth-error" role="alert">{error}</p> : null}<a href="/login">Till inloggningen</a>
  </div></section>;
}

export type OAuthConsentData = { clientId: string; clientName: string; state: string; scope: string; resource: string; csrfParameter: string; csrfToken: string };
export function OAuthConsent({ data, pending = false, error, example = false }: { data?: OAuthConsentData; pending?: boolean; error?: string; example?: boolean }) {
  return <section className="auth-card"><h1>Godkänn åtkomst</h1>
    {pending ? <p role="status">Hämtar åtkomstförfrågan…</p> : null}
    {error ? <p className="auth-error" role="alert">{error}</p> : null}
    {data ? <><p>{data.clientName} vill läsa dina aktiviteter via Förena MCP.</p><p>Åtkomsten ger inga nya förenings- eller familjerättigheter.</p>
      <form className="auth-form" method="post" action="/oauth2/authorize" onSubmit={example ? event => event.preventDefault() : undefined}>
        <input type="hidden" name="client_id" value={data.clientId} /><input type="hidden" name="state" value={data.state} />
        <input type="hidden" name="resource" value={data.resource} /><input type="hidden" name={data.csrfParameter} value={data.csrfToken} />
        <button className="primary" name="scope" value={data.scope} type="submit">Godkänn läsåtkomst</button><button className="secondary" type="submit">Avbryt</button>
      </form></> : null}
  </section>;
}
