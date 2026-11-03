"use client";

import { useEffect, useState } from "react";
import { monitorAppVersion } from "@/lib/app-version-monitor";

const REMINDER_DELAY = 60 * 60_000;

export function AppUpdateNotice({ currentVersion }: { currentVersion: string }) {
  const [available, setAvailable] = useState(false);
  const [dismissedUntil, setDismissedUntil] = useState<number | null>(null);
  useEffect(() => monitorAppVersion(currentVersion, () => setAvailable(true)), [currentVersion]);
  useEffect(() => {
    if (dismissedUntil === null) return;
    const remind = () => {
      if (Date.now() >= dismissedUntil) setDismissedUntil(null);
    };
    const timer = window.setTimeout(remind, Math.max(0, dismissedUntil - Date.now()));
    // Background tabs may suspend timers. Check the deadline when returning too.
    document.addEventListener("visibilitychange", remind);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", remind);
    };
  }, [dismissedUntil]);
  if (!available || dismissedUntil !== null) return null;
  return <AppUpdateNoticeView
    onReload={() => window.location.reload()}
    onDismiss={() => setDismissedUntil(Date.now() + REMINDER_DELAY)}
  />;
}

export function AppUpdateNoticeView({ onReload, onDismiss }: { onReload: () => void; onDismiss: () => void }) {
  return (
    <div className="app-update-notice">
      <p role="status">En ny version av Förena finns.</p>
      <button className="primary" type="button" onClick={onReload}>Ladda om</button>
      <button className="secondary" type="button" onClick={onDismiss} aria-label="Stäng påminnelsen">Stäng</button>
    </div>
  );
}
