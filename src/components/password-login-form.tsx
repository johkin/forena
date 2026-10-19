"use client";
import { useId } from "react";

export function PasswordLoginForm({ onLogin, pending = false, error }: {
  onLogin: (email: string, password: string) => void; pending?: boolean; error?: string;
}) {
  const id = useId();
  return <form className="auth-form" onSubmit={event => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    onLogin(String(data.get("email") ?? ""), String(data.get("password") ?? ""));
  }}>
    <label htmlFor={`${id}-email`}>E-postadress</label>
    <input id={`${id}-email`} name="email" type="email" autoComplete="email" required disabled={pending} />
    <label htmlFor={`${id}-password`}>Lösenord</label>
    <input id={`${id}-password`} name="password" type="password" autoComplete="current-password" required disabled={pending} />
    {error ? <p className="auth-error" role="alert">{error}</p> : null}
    <button className="primary" type="submit" disabled={pending}>{pending ? "Loggar in…" : "Logga in"}</button>
  </form>;
}
