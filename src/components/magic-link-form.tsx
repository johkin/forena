"use client";
import { useEffect, useId, useState } from "react";

export function MagicLinkForm({ onRequest, pending = false, sent = false, error }: {
  onRequest: (email: string) => void; pending?: boolean; sent?: boolean; error?: string;
}) {
  const id = useId();
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!remaining) return;
    const timer = window.setTimeout(() => setRemaining(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining]);
  return <form className="auth-form" onSubmit={event => {
    event.preventDefault();
    if (pending || remaining) return;
    setRemaining(60);
    onRequest(String(new FormData(event.currentTarget).get("email") ?? ""));
  }}>
    <label htmlFor={`${id}-email`}>E-postadress för inloggningslänk</label>
    <input id={`${id}-email`} name="email" type="email" autoComplete="email" required disabled={pending} />
    <p className="auth-muted">Öppna länken i samma webbläsare som du använder nu.</p>
    {sent ? <p className="auth-message" role="status">Om adressen har ett konto får du en inloggningslänk. Kontrollera din inkorg och skräppost.</p> : null}
    {error ? <p className="auth-error" role="alert">{error}</p> : null}
    <button className="secondary" type="submit" disabled={pending || remaining > 0}>{pending ? "Skickar…" : remaining > 0 ? `Skicka igen om ${remaining} s` : sent ? "Skicka en ny inloggningslänk" : "Skicka inloggningslänk"}</button>
  </form>;
}

export function MagicLinkConfirmation({ onConfirm, pending = false, error }: {
  onConfirm: () => void; pending?: boolean; error?: string;
}) {
  return <section className="auth-card"><h1>Logga in med din länk</h1>
    <p>Fortsätt för att bekräfta inloggningen på den här enheten.</p>
    {error ? <p className="auth-error" role="alert">{error}</p> : null}
    <div className="auth-form"><button className="primary" type="button" onClick={onConfirm} disabled={pending}>{pending ? "Loggar in…" : "Fortsätt och logga in"}</button>
    <a href="/login">Till inloggningen</a></div>
  </section>;
}
