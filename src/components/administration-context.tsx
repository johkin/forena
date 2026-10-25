"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { administrationOverviewSchema, type AdministrationOverview } from "../lib/administration";
import type { ParticipationFetch } from "./activity-invitation-response";

type AdministrationState = { data?: AdministrationOverview; error?: string; refresh: () => void };
const AdministrationContext = createContext<AdministrationState | undefined>(undefined);

export function useAdministrationAccess() {
  return useContext(AdministrationContext);
}

/** One account-bound snapshot supplies both navigation and administration pages. */
export function useAdministrationOverview(request: ParticipationFetch, routeKey?: string): AdministrationState {
  const shared = useAdministrationAccess();
  const [data, setData] = useState<AdministrationOverview>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    if (shared) return;
    const controller = new AbortController();
    request("/api/admin/overview", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Administrationen kunde inte hämtas.");
      return administrationOverviewSchema.parse(await response.json());
    }).then(result => { if (!controller.signal.aborted) { setData(result); setError(undefined); } })
      .catch(() => { if (!controller.signal.aborted) { setData(undefined); setError("Administrationen kunde inte hämtas. Försök igen."); } });
    return () => controller.abort();
  }, [request, attempt, shared, routeKey]);
  useEffect(() => {
    if (shared) return;
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", visible); };
  }, [shared, refresh]);
  return shared ?? { data, error, refresh };
}

export function AdministrationProvider({ request, routeKey, children }: { request: ParticipationFetch; routeKey?: string; children: ReactNode }) {
  const state = useAdministrationOverview(request, routeKey);
  return <AdministrationContext value={state}>{children}</AdministrationContext>;
}
