"use client";

import { useEffect, useState } from "react";

export type TelegramState = { active: boolean; available: boolean; accountSuffix?: string; pairingUrl?: string; confirmInBot?: boolean };
type ViewProps = { enrollmentSuffix?: string; state: TelegramState | null; pending: boolean; error: string; onStart: () => void; onDisable: () => void; onRefresh: () => void };

export function TelegramSettingsView({ state, pending, error, onStart, onDisable, onRefresh, enrollmentSuffix }: ViewProps) {
  return <section id="telegram" className="form-section" aria-label="Telegram-notifieringar">
    <h2>Telegram</h2>
    <p>Få privata kallelser och påminnelser i Telegram. Svara Kommer eller Kan inte direkt med knapparna. Varje barn får en egen kallelse. Om Telegram inte kan skickas försöker vi med push eller e-post.</p>
    {error ? <p className="auth-error" role="alert">{error}</p> : null}
    <div role="status" aria-live="polite">{!state ? <p>Hämtar inställningen…</p> : state.active
      ? <p>Telegram är aktiverat för ditt konto.</p>
      : !state.available ? <p>Telegram är inte tillgängligt ännu.</p>
      : state.pairingUrl ? state.confirmInBot ? <p>Bekräfta kopplingen med knappen i meddelandet från boten. Statusen uppdateras automatiskt när du är klar.</p> : <p>Öppna Telegram och tryck Start för att koppla ditt konto. Länken gäller i tio minuter. Dela den inte med andra.</p>
      : enrollmentSuffix ? <p>Godkänn kopplingen till Telegram-kontot vars ID slutar på {enrollmentSuffix}. Godkänn här och bekräfta sedan med knappen hos boten.</p> : <p>Telegram är inte aktiverat.</p>}</div>
    {state?.active ? <button type="button" className="secondary" disabled={pending} onClick={onDisable}>Stäng av Telegram</button>
      : state?.pairingUrl ? <div className="component-example-actions">
        <a className="primary" href={state.pairingUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Öppna Telegram</a>
        <button type="button" className="secondary" disabled={pending} onClick={onRefresh}>Uppdatera status</button>
        <button type="button" className="secondary" disabled={pending} onClick={onDisable}>Avbryt koppling</button>
      </div> : state?.available ? <TelegramConsent pending={pending} onStart={onStart} enrollmentSuffix={enrollmentSuffix} /> : null}
    {state?.active || state?.pairingUrl ? <p className="form-help">Du kan stänga av här eller skicka /stop till boten. Kommentarer skriver du i Förena. Andra privata meddelanden visar kopplingshjälp och tolkas inte som instruktioner.</p> : null}
    {error && !state ? <button type="button" className="secondary" disabled={pending} onClick={onRefresh}>Försök igen</button> : null}
  </section>;
}

// Leaving the setup step discards consent, including in the component gallery.
function TelegramConsent({ pending, onStart, enrollmentSuffix }: Pick<ViewProps, "pending" | "onStart" | "enrollmentSuffix">) {
  const [consent, setConsent] = useState(false);
  return <>
    <label className="settings-checkbox"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={pending} />Jag vill få notifieringar från Förena via Telegram och samtycker till att mitt Telegram-konto, kallelser och notifieringar behandlas av Telegram för leveransen.</label>
    <button type="button" className="primary" disabled={pending || !consent} onClick={onStart}>{pending ? "Förbereder…" : enrollmentSuffix ? "Godkänn och koppla Telegram" : "Koppla Telegram"}</button>
  </>;
}

export function TelegramSettings({ enrollmentProof, enrollmentSuffix }: { enrollmentProof?: string; enrollmentSuffix?: string } = {}) {
  const [state, setState] = useState<TelegramState | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(enrollmentProof && !enrollmentSuffix ? "Kopplingslänken är ogiltig eller har gått ut. Skicka /start till boten för en ny länk, eller koppla Telegram härifrån." : "");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/telegram/settings", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Inställningen kunde inte hämtas.");
      setState(await response.json() as TelegramState);
    }).catch(() => { if (!controller.signal.aborted) setError("Inställningen kunde inte hämtas. Försök igen."); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!state?.pairingUrl || state.active) return;
    const controller = new AbortController();
    const deadline = Date.now() + 600_000;
    let inFlight = false;
    async function refresh() {
      if (Date.now() > deadline) { window.clearInterval(timer); return; }
      if (document.visibilityState === "hidden" || inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/telegram/settings", { cache: "no-store", signal: controller.signal });
        if (response.ok) {
          const next = await response.json() as TelegramState;
          if (!controller.signal.aborted && next.active) {
            setState(next);
            const url = new URL(window.location.href);
            if (url.searchParams.has("telegram")) { url.searchParams.delete("telegram"); window.history.replaceState(null, "", url); }
          }
        }
      } catch { /* Keep the link and manual retry if the network is unavailable. */ }
      finally { inFlight = false; }
    }
    const timer = window.setInterval(() => void refresh(), 3000);
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [state?.pairingUrl, state?.active]);

  async function update(operation?: "start" | "disable") {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/telegram/settings", operation ? {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation, consent: operation === "start", ...(operation === "start" && enrollmentSuffix ? { enrollmentProof } : {}) }),
      } : { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Inställningen kunde inte sparas.");
      if (body.active && enrollmentProof) window.history.replaceState(null, "", "/profile#telegram");
      // A status check before Telegram's webhook arrives must preserve the link.
      setState(current => ({ ...body, pairingUrl: !operation && !body.active ? current?.pairingUrl : body.pairingUrl, confirmInBot: !operation && !body.active ? current?.confirmInBot : body.confirmInBot }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Inställningen kunde inte sparas.");
    } finally { setPending(false); }
  }

  return <TelegramSettingsView enrollmentSuffix={enrollmentSuffix} state={state} pending={pending} error={error}
    onStart={() => void update("start")} onDisable={() => void update("disable")} onRefresh={() => void update()} />;
}

export function TelegramSettingsExamples() {
  const [mode, setMode] = useState("inactive");
  const state = mode === "loading" ? null : { active: mode === "active", available: mode !== "unavailable", accountSuffix: "1234", confirmInBot: mode === "confirmation", pairingUrl: ["pairing", "confirmation"].includes(mode) ? "#telegram-example" : undefined };
  return <section id="telegram-example"><h2>Telegram-notifieringar</h2>
    <label>Exempeltillstånd<select value={mode} onChange={event => setMode(event.target.value)}>
      <option value="enrollment">Start från boten</option><option value="inactive">Ej aktiverat</option><option value="confirmation">Bekräfta hos boten</option><option value="pairing">Väntar på verifiering</option><option value="active">Aktiverat</option>
      <option value="loading">Laddar</option><option value="pending">Sparar</option><option value="error">Fel</option><option value="unavailable">Inte konfigurerat</option>
    </select></label>
    <TelegramSettingsView enrollmentSuffix={mode === "enrollment" ? "1234" : undefined} state={state} pending={mode === "pending"} error={mode === "error" ? "Inställningen kunde inte sparas. Försök igen." : ""}
      onStart={() => setMode(mode === "enrollment" ? "confirmation" : "pairing")} onDisable={() => setMode("inactive")} onRefresh={() => setMode("active")} />
  </section>;
}
