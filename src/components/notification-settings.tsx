"use client";

import { useEffect, useRef, useState } from "react";

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
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PushState>("checking");
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const secureContext = typeof window === "undefined" || window.isSecureContext;

  useEffect(() => {
    let cancelled = false;
    async function checkState() {
      await Promise.resolve();
      if (!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || !publicKey) {
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
    function closeOnOutsideClick(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
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
    unsupported: !secureContext ? "Pushnotiser kräver HTTPS eller localhost." : publicKey ? "Den här webbläsaren stöder inte pushnotiser." : "Pushnotiser är inte konfigurerade ännu.",
    blocked: "Notiser är blockerade i webbläsarens inställningar.",
    inactive: "Få kallelser och påminnelser även när Förena är stängt.",
    active: "Pushnotiser är aktiverade på den här enheten.",
    error: errorMessage || "Inställningen kunde inte sparas. Försök igen.",
  };

  return <div className="notification-settings" ref={panelRef}>
    <button
      aria-expanded={open}
      aria-haspopup="dialog"
      className={`notification-settings-trigger${state === "active" ? " active" : ""}`}
      onClick={() => setOpen((current) => !current)}
      type="button"
    >Notiser</button>
    {open ? <section aria-label="Notisinställningar" className="notification-settings-panel">
      <p className="eyebrow">Profil</p>
      <h2>Notisinställningar</h2>
      <p>{descriptions[state]}</p>
      {state === "active"
        ? <button className="secondary" disabled={pending} onClick={() => void disable()} type="button">{pending ? "Stänger av…" : "Stäng av pushnotiser"}</button>
        : <button className="primary" disabled={pending || state === "unsupported" || state === "blocked" || state === "checking"} onClick={() => void enable()} type="button">{pending ? "Aktiverar…" : "Aktivera pushnotiser"}</button>}
    </section> : null}
  </div>;
}
