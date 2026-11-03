"use client";

import { useState } from "react";
import { AppUpdateNoticeView } from "./app-update-notice";

export function AppUpdateNoticeExample() {
  const [state, setState] = useState<"available" | "dismissed" | "loaded">("available");
  return <section id="app-update-example" className="app-update-example">
    <h2>Ny frontendversion</h2>
    <p>Påminnelsen visas under sidhuvudet utan att flytta fokus. Stängning döljer den i en timme i den öppna fliken.</p>
    {state === "available" ? <AppUpdateNoticeView onReload={() => setState("loaded")} onDismiss={() => setState("dismissed")} /> : <>
      <p role="status">{state === "dismissed" ? "Påminnelsen är stängd. Den återkommer efter en timme." : "Aktuell version är laddad. Ingen påminnelse visas."}</p>
      <button type="button" className="secondary" onClick={() => setState("available")}>{state === "dismissed" ? "Visa nästa påminnelse" : "Visa ny version"}</button>
    </>}
    <p>Exemplet simulerar nästa påminnelse och omladdning utan att lämna komponentsidan.</p>
  </section>;
}
