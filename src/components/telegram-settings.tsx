"use client";

import { useEffect, useState } from "react";

export type TelegramState = { active: boolean; available: boolean; accountSuffix?: string; pairingUrl?: string; pairingExpiresAt?: number };
type ViewProps = { state: TelegramState | null; pending: boolean; error: string; onStart: () => void; onDisable: () => void; onRefresh: () => void };

export function TelegramSettingsView({ state, pending, error, onStart, onDisable, onRefresh }: ViewProps) {
  return <section id="telegram" className="form-section" aria-label="Telegram-notifieringar">
    <h2>Telegram</h2>
    <p>Få privata kallelser och påminnelser i Telegram. Svara Kommer eller Kan inte direkt med knapparna. Varje barn får en egen kallelse. Om Telegram inte kan skickas försöker vi med push eller e-post.</p>
    {error ? <p className="auth-error" role="alert">{error}</p> : null}
    <div role="status" aria-live="polite">{!state ? <p>Hämtar inställningen…</p> : state.active
      ? <p>Telegram är aktiverat för ditt konto.</p>
      : !state.available ? <p>Telegram är inte tillgängligt ännu.</p>
      : state.pairingUrl ? <p>Telegram öppnas. Tryck Start hos boten för att slutföra kopplingen. Om Telegram inte öppnades kan du använda länken nedan. Länken gäller i tio minuter och ska inte delas.</p>
      : <p>Telegram är inte aktiverat.</p>}</div>
    {state?.active ? <button type="button" className="secondary" disabled={pending} onClick={onDisable}>Stäng av Telegram</button>
      : state?.pairingUrl ? <div className="component-example-actions">
        <a className="secondary" href={state.pairingUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Öppna Telegram igen</a>
        <button type="button" className="secondary" disabled={pending} onClick={onDisable}>Avbryt koppling</button>
      </div> : state?.available ? <TelegramConsent pending={pending} onStart={onStart} /> : null}
    {state?.active || state?.pairingUrl ? <p className="form-help">Du kan stänga av här eller skicka /stop till boten. Kommentarer skriver du i Förena. Andra privata meddelanden visar kopplingshjälp och tolkas inte som instruktioner.</p> : null}
    {error && !state ? <button type="button" className="secondary" disabled={pending} onClick={onRefresh}>Försök igen</button> : null}
  </section>;
}

// The explicit activation click is consent; preparing or opening the profile is not.
function TelegramConsent({ pending, onStart }: Pick<ViewProps, "pending" | "onStart">) {
  return <>
    <p id="telegram-consent" className="form-help">Genom att välja Aktivera Telegram samtycker du till att ditt Telegram-konto, dina kallelser och notifieringar behandlas av Telegram för leveransen. Du kan när som helst stänga av Telegram här eller skicka /stop till boten.</p>
    <button type="button" className="primary" aria-describedby="telegram-consent" disabled={pending} onClick={onStart}>{pending ? "Öppnar Telegram…" : "Aktivera Telegram"}</button>
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

  useEffect(() => {
    if (!state?.pairingUrl || state.active) return;
    const controller = new AbortController();
    const deadline = state.pairingExpiresAt ?? Date.now() + 600_000;
    let inFlight = false;
    async function refresh() {
      if (Date.now() >= deadline) {
        window.clearInterval(timer);
        setState(current => current?.active ? current : current ? { ...current, pairingUrl: undefined, pairingExpiresAt: undefined } : current);
        setError("Kopplingslänken har gått ut. Välj Aktivera Telegram för att skapa en ny länk.");
        return;
      }
      if (document.visibilityState === "hidden" || inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/telegram/settings", { cache: "no-store", signal: controller.signal });
        if (response.ok) {
          const next = await response.json() as TelegramState;
          if (!controller.signal.aborted && next.active) {
            setState(next);
          }
        }
      } catch { /* Keep the link and manual retry if the network is unavailable. */ }
      finally { inFlight = false; }
    }
    const timer = window.setInterval(() => void refresh(), 3000);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort(); window.clearInterval(timer);
      window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [state?.pairingUrl, state?.active, state?.pairingExpiresAt]);

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
      setState(current => ({ ...body, pairingUrl: !operation && !body.active ? current?.pairingUrl : body.pairingUrl, pairingExpiresAt: operation === "start" && body.pairingUrl ? Date.now() + 600_000 : !operation && !body.active ? current?.pairingExpiresAt : undefined }));
      // Navigate in the current tab: no popup is needed after the async request.
      // The saved state and fallback link remain available on return.
      if (operation === "start" && !body.active && body.pairingUrl) window.location.assign(body.pairingUrl);
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
      <option value="loading">Laddar</option><option value="pending">Sparar</option><option value="expired">Utgången länk</option><option value="error">Fel</option><option value="unavailable">Inte konfigurerat</option>
    </select></label>
    <TelegramSettingsView state={state} pending={mode === "pending"} error={mode === "expired" ? "Kopplingslänken har gått ut. Välj Aktivera Telegram för att skapa en ny länk." : mode === "error" ? "Inställningen kunde inte sparas. Försök igen." : ""}
      onStart={() => setMode("pairing")} onDisable={() => setMode("inactive")} onRefresh={() => setMode("active")} />
  </section>;
}
