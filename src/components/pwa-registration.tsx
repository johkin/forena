"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function PwaRegistration() {
  const router = useRouter();
  useEffect(() => {
    const refresh = (event: MessageEvent) => { if (event.data?.type === "activity-notification") router.refresh(); };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", refresh);
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Notisinställningen visar ett användarnära fel om registreringen misslyckas.
      });
    }
    return () => { if ("serviceWorker" in navigator) navigator.serviceWorker.removeEventListener("message", refresh); };
  }, [router]);

  return null;
}

