"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Notisinställningen visar ett användarnära fel om registreringen misslyckas.
      });
    }
  }, []);

  return null;
}
