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
  return existing ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export function NotificationSettings() {
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PushState>("checking");
  const [pending, setPending] = useState(false);
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";

  useEffect(() => {
    let cancelled = false;
    async function checkState() {
      await Promise.resolve();
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || !publicKey) {
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
        const unsubscribed = await subscription.unsubscribe();
        if (!unsubscribed) throw new Error("browser_unsubscribe_failed");
        throw new Error("subscription_save_failed");
      }
      setState("active");
    } catch {
      setState("error");
    } finally {
      setPending(false);
    }
  }

  async function disable() {
    setPending(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/push-subscriptions", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("subscription_disable_failed");
        const unsubscribed = await subscription.unsubscribe();
        if (!unsubscribed) throw new Error("browser_unsubscribe_failed");
      }
      setState("inactive");
    } catch {
      setState("error");
    } finally {
      setPending(false);
    }
  }

  const descriptions: Record<PushState, string> = {
    checking: "Kontrollerar inställningen…",
    unsupported: publicKey ? "Den här webbläsaren stöder inte pushnotiser." : "Pushnotiser är inte konfigurerade ännu.",
    blocked: "Notiser är blockerade i webbläsarens inställningar.",
    inactive: "Få kallelser och påminnelser även när Förena är stängt.",
    active: "Pushnotiser är aktiverade på den här enheten.",
    error: "Inställningen kunde inte sparas. Försök igen.",
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
