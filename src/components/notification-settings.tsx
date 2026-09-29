"use client";

import { useEffect, useState } from "react";

type PushState = "checking" | "unsupported" | "blocked" | "inactive" | "active" | "error";

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function serviceWorkerRegistration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (!existing) await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

function pushErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Webbläsaren nekade pushnotiser. Kontrollera webbplatsens notisbehörighet.";
  }
  if (error instanceof DOMException && error.name === "InvalidStateError") {
    return "Service workern är inte redo. Ladda om sidan och försök igen.";
  }
  return error instanceof Error && error.message && !error.message.endsWith("_failed")
    ? error.message
    : "Inställningen kunde inte sparas. Försök igen.";
}

export function NotificationSettings() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PushState>("checking");
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [iosBrowser, setIosBrowser] = useState(false);
  const [androidBrowser, setAndroidBrowser] = useState(false);
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const secureContext = typeof window === "undefined" || window.isSecureContext;

  useEffect(() => {
    let cancelled = false;
    async function checkState() {
      await Promise.resolve();
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const requiresHomeScreen = /iPhone|iPad|iPod/.test(navigator.userAgent) && !standalone;
      if (!cancelled) {
        setIosBrowser(requiresHomeScreen);
        setAndroidBrowser(/Android/i.test(navigator.userAgent) && !standalone);
      }
      if (requiresHomeScreen || !window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || !publicKey) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("blocked");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (!cancelled) setState(subscription ? "active" : "inactive");
      } catch {
        if (!cancelled) setState("error");
      }
    }
    void checkState();
    return () => { cancelled = true; };
  }, [publicKey]);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  async function enable() {
    setPending(true);
    setState("checking");
    setErrorMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "inactive");
        return;
      }

      const registration = await serviceWorkerRegistration();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(publicKey),
      });
      const response = await fetch("/api/push-subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        await subscription.unsubscribe().catch(() => false);
        throw new Error(body?.error ?? "Push-prenumerationen kunde inte sparas.");
      }
      setState("active");
    } catch (error) {
      setErrorMessage(pushErrorMessage(error));
      setState("error");
    } finally {
      setPending(false);
    }
  }

  async function disable() {
    setPending(true);
    setErrorMessage("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/push-subscriptions", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(body?.error ?? "Push-prenumerationen kunde inte stängas av.");
        }
        const unsubscribed = await subscription.unsubscribe();
        if (!unsubscribed) throw new Error("browser_unsubscribe_failed");
      }
      setState("inactive");
    } catch (error) {
      setErrorMessage(pushErrorMessage(error));
      setState("error");
    } finally {
      setPending(false);
    }
  }

  const descriptions: Record<PushState, string> = {
    checking: "Kontrollerar inställningen…",
    unsupported: !secureContext ? "Pushnotiser kräver HTTPS eller localhost." : iosBrowser ? "På iPhone och iPad behöver du öppna Förena från hemskärmen för att aktivera push." : publicKey ? "Den här webbläsaren stöder inte pushnotiser." : "Pushnotiser är inte konfigurerade ännu.",
    blocked: "Notiser är blockerade i webbläsarens inställningar.",
    inactive: "Få kallelser och påminnelser även när Förena är stängt.",
    active: "Pushnotiser är aktiverade på den här enheten.",
    error: errorMessage || "Inställningen kunde inte sparas. Försök igen.",
  };

  return <div className="notification-settings">
    <button
      aria-expanded={open}
      aria-haspopup="dialog"
      className={`notification-settings-trigger${state === "active" ? " active" : ""}`}
      onClick={() => setOpen((current) => !current)}
      aria-label={state === "active" ? "Pushnotiser aktiverade, öppna inställningar" : "Pushnotiser inaktiva, öppna inställningar"}
      title={state === "active" ? "Pushnotiser aktiverade" : "Pushnotiser inaktiva"}
      type="button"
    ><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>{state !== "active" ? <path d="M3 3l18 18" strokeWidth="2.2"/> : null}</svg><span>Notiser</span></button>
    {open ? <div className="notification-settings-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
    <section aria-label="Notisinställningar" aria-modal="true" role="dialog" className="notification-settings-panel">
      <button className="notification-settings-close" type="button" aria-label="Stäng" onClick={() => setOpen(false)}>×</button>
      <p className="eyebrow">Profil</p>
      <h2>Notisinställningar</h2>
      <p>{descriptions[state]}</p>
      {iosBrowser ? <p className="notification-settings-help">Öppna Förena i Safari, tryck på Dela och välj <strong>Lägg till på hemskärmen</strong>. Öppna sedan Förena via ikonen på hemskärmen och tryck på <strong>Aktivera pushnotiser</strong> här.</p> : null}
      {androidBrowser ? <p className="notification-settings-help">Du kan aktivera push här i webbläsaren. Vill du använda Förena som app väljer du <strong>Installera app</strong> eller <strong>Lägg till på startskärmen</strong> i webbläsarens meny och öppnar sedan Förena via ikonen.</p> : null}
      {state === "blocked" ? <p className="notification-settings-help">Tillåt notiser för Förena i enhetens eller webbläsarens inställningar och öppna sidan igen.</p> : null}
      {state === "active"
        ? <button className="secondary" disabled={pending} onClick={() => void disable()} type="button">{pending ? "Stänger av…" : "Stäng av pushnotiser"}</button>
        : <button className="primary" disabled={pending || state === "unsupported" || state === "blocked" || state === "checking"} onClick={() => void enable()} type="button">{pending ? "Aktiverar…" : "Aktivera pushnotiser"}</button>}
    </section></div> : null}
  </div>;
}
