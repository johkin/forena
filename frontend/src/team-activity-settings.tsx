import { useEffect, useState } from "react";
import { z } from "zod";
import type { ParticipationFetch } from "../../src/components/activity-invitation-response";
import { TeamActivitySettings } from "../../src/components/team-activity-settings";
import { AppLink } from "./app-link";

const teamsSchema = z.array(z.object({ id: z.uuid() }));

export function useTeamSettingsAccess(request: ParticipationFetch, teamId: string) {
  const [status, setStatus] = useState<"loading" | "allowed" | "denied" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    request("/api/me/managed-teams", { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error();
        return teamsSchema.parse(await response.json());
      })
      .then(teams => {
        if (!controller.signal.aborted) setStatus(teams.some(team => team.id === teamId) ? "allowed" : "denied");
      })
      .catch(() => { if (!controller.signal.aborted) setStatus("error"); });
    return () => controller.abort();
  }, [request, teamId, attempt]);
  function retry() {
    setStatus("loading");
    setAttempt(value => value + 1);
  }
  return { status, retry };
}

export function TeamActivitySettingsPage({ request, teamId }: {
  request: ParticipationFetch;
  teamId: string;
}) {
  const { status, retry } = useTeamSettingsAccess(request, teamId);
  return <>
    <AppLink className="squad-back" href={`/teams/${teamId}`}>← Tillbaka till laget</AppLink>
    {status === "allowed" ? <TeamActivitySettings request={request} teamId={teamId} /> : <section className="application-card">
      <h1>Aktivitets<wbr />inställningar</h1>
      {status === "loading" ? <p role="status">Kontrollerar behörighet…</p>
        : status === "error" ? <div role="alert"><p>Behörigheten kunde inte kontrolleras.</p><button type="button" onClick={retry}>Försök igen</button></div>
        : <p>Du saknar behörighet att hantera lagets aktivitetsinställningar.</p>}
    </section>}
  </>;
}
