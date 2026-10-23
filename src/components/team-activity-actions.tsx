"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import type { ParticipationFetch } from "./activity-invitation-response";

const managedTeamsSchema = z.array(z.object({ id: z.uuid() }));

/** Membership and workspace visibility alone do not grant permission to create. */
export function TeamActivityActions({ teamId, request, onCreate }: {
  teamId: string; request: ParticipationFetch; onCreate: () => void;
}) {
  const [authorizedTeam, setAuthorizedTeam] = useState<string>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    request("/api/me/managed-teams", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Team permissions unavailable");
      return managedTeamsSchema.parse(await response.json());
    }).then(teams => {
      if (controller.signal.aborted) return;
      setAuthorizedTeam(teams.some(team => team.id === teamId) ? teamId : undefined);
      setError(false);
    }).catch(() => {
      if (!controller.signal.aborted) { setAuthorizedTeam(undefined); setError(true); }
    });
    return () => controller.abort();
  }, [request, teamId, attempt]);

  if (error) return <div role="alert"><p>Behörigheten att skapa aktiviteter kunde inte kontrolleras.</p>
    <button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>Försök igen</button></div>;
  if (authorizedTeam !== teamId) return null;
  return <div className="welcome-actions team-activity-actions"><button type="button" className="primary" onClick={onCreate}>Ny aktivitet</button></div>;
}
