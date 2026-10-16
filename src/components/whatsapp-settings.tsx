"use client";

import { useEffect, useState } from "react";

export type WhatsAppState = { active: boolean; available: boolean; phoneSuffix?: string; pairingUrl?: string };
type ViewProps = { state: WhatsAppState | null; pending: boolean; error: string; onStart: () => void; onDisable: () => void; onRefresh: () => void };

export function WhatsAppSettingsView({ state, pending, error, onStart, onDisable, onRefresh }: ViewProps) {
  const [consent, setConsent] = useState(false);
  return <section id="whatsapp" className="form-section" aria-label="WhatsApp-notifieringar">
    <h2>WhatsApp</h2>
    <p>Få privata kallelser och påminnelser i WhatsApp. Svara Kommer eller Kan inte direkt med knapparna. Varje barn får en egen kallelse. Om WhatsApp inte kan skickas försöker vi med push eller e-post.</p>
    {error ? <p className="auth-error" role="alert">{error}</p> : null}
    <div role="status" aria-live="polite">{!state ? <p>Hämtar inställningen…</p> : state.active
      ? <p>WhatsApp är aktiverat för numret som slutar på {state.phoneSuffix}.</p>
      : !state.available ? <p>WhatsApp är inte tillgängligt ännu.</p>
      : state.pairingUrl ? <p>Öppna WhatsApp och skicka det förifyllda meddelandet för att verifiera ditt nummer. Länken gäller i tio minuter. Dela den inte med andra.</p>
      : <p>WhatsApp är inte aktiverat.</p>}</div>
    {state?.active ? <button type="button" className="secondary" disabled={pending} onClick={onDisable}>Stäng av WhatsApp</button>
      : state?.pairingUrl ? <div className="component-example-actions">
        <a className="primary" href={state.pairingUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Öppna WhatsApp</a>
        <button type="button" className="secondary" disabled={pending} onClick={onRefresh}>Jag har skickat meddelandet</button>
        <button type="button" className="secondary" disabled={pending} onClick={onDisable}>Avbryt koppling</button>
      </div> : state?.available ? <>
        <label className="settings-checkbox"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={pending} />Jag vill få notifieringar från Förena via WhatsApp och samtycker till att mitt nummer, kallelser och notifieringar behandlas av Meta för leveransen.</label>
        <button type="button" className="primary" disabled={pending || !consent} onClick={onStart}>{pending ? "Förbereder…" : "Koppla WhatsApp"}</button>
      </> : null}
    {state?.active || state?.pairingUrl ? <p className="form-help">Du kan stänga av här eller skicka STOPP i WhatsApp. Kommentarer skriver du i Förena. Övriga meddelanden behandlas inte.</p> : null}
    {error && !state ? <button type="button" className="secondary" disabled={pending} onClick={onRefresh}>Försök igen</button> : null}
  </section>;
}

export function WhatsAppSettings() {
  const [state, setState] = useState<WhatsAppState | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/whatsapp/settings", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Inställningen kunde inte hämtas.");
      setState(await response.json() as WhatsAppState);
    }).catch(() => { if (!controller.signal.aborted) setError("Inställningen kunde inte hämtas. Försök igen."); });
    return () => controller.abort();
  }, []);

  async function update(operation?: "start" | "disable") {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/whatsapp/settings", operation ? {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation, consent: operation === "start" }),
      } : { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Inställningen kunde inte sparas.");
      // A status check before Meta's webhook arrives must preserve the link.
      setState(current => ({ ...body, pairingUrl: !operation && !body.active ? current?.pairingUrl : body.pairingUrl }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Inställningen kunde inte sparas.");
    } finally { setPending(false); }
  }

  return <WhatsAppSettingsView state={state} pending={pending} error={error}
    onStart={() => void update("start")} onDisable={() => void update("disable")} onRefresh={() => void update()} />;
}

export function WhatsAppSettingsExamples() {
  const [mode, setMode] = useState("inactive");
  const state = mode === "loading" ? null : { active: mode === "active", available: mode !== "unavailable", phoneSuffix: "1234", pairingUrl: mode === "pairing" ? "#whatsapp-example" : undefined };
  return <section id="whatsapp-example"><h2>WhatsApp-notifieringar</h2>
    <label>Exempeltillstånd<select value={mode} onChange={event => setMode(event.target.value)}>
      <option value="inactive">Ej aktiverat</option><option value="pairing">Väntar på verifiering</option><option value="active">Aktiverat</option>
      <option value="loading">Laddar</option><option value="pending">Sparar</option><option value="error">Fel</option><option value="unavailable">Inte konfigurerat</option>
    </select></label>
    <WhatsAppSettingsView state={state} pending={mode === "pending"} error={mode === "error" ? "Inställningen kunde inte sparas. Försök igen." : ""}
      onStart={() => setMode("pairing")} onDisable={() => setMode("inactive")} onRefresh={() => setMode("active")} />
  </section>;
}
