"use client";
import { ConfirmSubmit } from "./confirm-submit";

export function PasskeyList({ items = [], pending = false, error, onRemove }: {
  items?: { id: string; label: string }[]; pending?: boolean; error?: string; onRemove: (id: string) => void;
}) {
  return <section className="auth-card"><h2>Dina passkeys</h2>
    {pending ? <p role="status">Hämtar passkeys…</p> : null}
    {error ? <p role="alert" className="auth-error">{error}</p> : null}
    {!pending && !error && !items.length ? <p>Du har inga registrerade passkeys.</p> : null}
    {items.map(item => <form className="auth-form" key={item.id} onSubmit={event => { event.preventDefault(); onRemove(item.id); }}>
      <p>{item.label}</p><ConfirmSubmit label="Ta bort passkey" message="Ta bort den här passkeyn? Du kan fortfarande logga in med lösenord eller mejllänk." disabled={pending} />
    </form>)}
  </section>;
}
