"use client";

import { useEffect, useState } from "react";

export type TelegramState = { active: boolean; available: boolean; accountSuffix?: string; pairingUrl?: string };
type ViewProps = { state: TelegramState | null; pending: boolean; error: string; onStart: () => void; onDisable: () => void; onRefresh: () => void };

export function TelegramSettingsView({ state, pending, error, onStart, onDisable, onRefresh }: ViewProps) {
  return <section id="telegram" className="form-section" aria-label="Telegram-notifieringar">
    <h2>Telegram</h2>
    <p>Få privata kallelser och påminnelser i Telegram. Svara Kommer eller Kan inte direkt med knapparna. Varje barn får en egen kallelse. Om Telegram inte kan skickas försöker vi med push eller e-post.</p>
    {error ? <p className="auth-error" role="alert">{error}</p> : null}
    <div role="status" aria-live="polite">{!state ? <p>Hämtar inställningen…</p> : state.active
      ? <p>Telegram är aktiverat för ditt konto.</p>
      : !state.available ? <p>Telegram är inte tillgängligt ännu.</p>
      : state.pairingUrl ? <p>Öppna Telegram och tryck Start för att koppla ditt konto. Länken gäller i tio minuter. Dela den inte med andra.</p>
      : <p>Telegram är inte aktiverat.</p>}</div>
    {state?.active ? <button type="button" className="secondary" disabled={pending} onClick={onDisable}>Stäng av Telegram</button>
      : state?.pairingUrl ? <div className="component-example-actions">
        <a className="primary" href={state.pairingUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Öppna Telegram</a>
        <button type="button" className="secondary" disabled={pending} onClick={onRefresh}>Jag har startat boten</button>
        <button type="button" className="secondary" disabled={pending} onClick={onDisable}>Avbryt koppling</button>
      </div> : state?.available ? <TelegramConsent pending={pending} onStart={onStart} /> : null}
    {state?.active || state?.pairingUrl ? <p className="form-help">Du kan stänga av här eller skicka /stop till boten. Kommentarer skriver du i Förena. Övriga meddelanden behandlas inte.</p> : null}
    {error && !state ? <button type="button" className="secondary" disabled={pending} onClick={onRefresh}>Försök igen</button> : null}
  </section>;
}

// Leaving the setup step discards consent, including in the component gallery.
function TelegramConsent({ pending, onStart }: Pick<ViewProps, "pending" | "onStart">) {
  const [consent, setConsent] = useState(false);
  return <>
    <label className="settings-checkbox"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={pending} />Jag vill få notifieringar från Förena via Telegram och samtycker till att mitt Telegram-konto, kallelser och notifieringar behandlas av Telegram för leveransen.</label>
    <button type="button" className="primary" disabled={pending || !consent} onClick={onStart}>{pending ? "Förbereder…" : "Koppla Telegram"}</button>
  </>;
}

export function TelegramSettings() {
  const [state, setState] = useState<TelegramState | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/telegram/settings", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Inställningen kunde inte hämtas.");
      setState(await response.json() as TelegramState);
    }).catch(() => { if (!controller.signal.aborted) setError("Inställningen kunde inte hämtas. Försök igen."); });
    return () => controller.abort();
  }, []);

  async function update(operation?: "start" | "disable") {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/telegram/settings", operation ? {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation, consent: operation === "start" }),
      } : { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Inställningen kunde inte sparas.");
      // A status check before Telegram's webhook arrives must preserve the link.
      setState(current => ({ ...body, pairingUrl: !operation && !body.active ? current?.pairingUrl : body.pairingUrl }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Inställningen kunde inte sparas.");
    } finally { setPending(false); }
  }

  return <TelegramSettingsView state={state} pending={pending} error={error}
    onStart={() => void update("start")} onDisable={() => void update("disable")} onRefresh={() => void update()} />;
}

export function TelegramSettingsExamples() {
  const [mode, setMode] = useState("inactive");
  const state = mode === "loading" ? null : { active: mode === "active", available: mode !== "unavailable", accountSuffix: "1234", pairingUrl: mode === "pairing" ? "#telegram-example" : undefined };
  return <section id="telegram-example"><h2>Telegram-notifieringar</h2>
    <label>Exempeltillstånd<select value={mode} onChange={event => setMode(event.target.value)}>
      <option value="inactive">Ej aktiverat</option><option value="pairing">Väntar på verifiering</option><option value="active">Aktiverat</option>
      <option value="loading">Laddar</option><option value="pending">Sparar</option><option value="error">Fel</option><option value="unavailable">Inte konfigurerat</option>
    </select></label>
    <TelegramSettingsView state={state} pending={mode === "pending"} error={mode === "error" ? "Inställningen kunde inte sparas. Försök igen." : ""}
      onStart={() => setMode("pairing")} onDisable={() => setMode("inactive")} onRefresh={() => setMode("active")} />
  </section>;
}
