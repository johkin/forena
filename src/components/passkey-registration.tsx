"use client";

export function PasskeyRegistration({ onRegister, pending = false, registered = false, supported = true, error }: {
  onRegister: () => void; pending?: boolean; registered?: boolean; supported?: boolean; error?: string;
}) {
  return <section className="auth-card"><h1>Inloggning</h1>
    <p>Skapa en passkey för att logga in med exempelvis Face ID, fingeravtryck eller en säkerhetsnyckel.</p>
    {!supported ? <p className="auth-muted">Den här webbläsaren stöder inte passkeys. Du kan logga in med lösenord eller en inloggningslänk.</p> : null}
    {registered ? <p className="auth-message" role="status">Din passkey har skapats. Du kan använda den nästa gång du loggar in.</p> : null}
    {error ? <p className="auth-error" role="alert">{error}</p> : null}
    <button className="primary" type="button" onClick={onRegister} disabled={pending || registered || !supported}>{pending ? "Skapar passkey…" : registered ? "Passkey skapad" : "Skapa passkey"}</button>
  </section>;
}
