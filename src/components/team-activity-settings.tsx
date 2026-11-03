"use client";

import type { ParticipationFetch } from "./activity-invitation-response";
import { ActivityDefaultsAdministration } from "./activity-defaults-administration";
import { ExtensionFields } from "./extension-fields";
import { DisciplineFollowUpTools } from "./discipline-follow-up-tools";

export function TeamActivitySettings({ request, teamId }: {
  request: ParticipationFetch;
  teamId: string;
}) {
  return <section className="application-card" aria-label="Aktivitetsinställningar">
    <h1>Aktivitets<wbr />inställningar</h1>
    <p>Förval för lagets aktiviteter, disciplinuppgifter och matchuppföljning.</p>
    <ActivityDefaultsAdministration request={request} scope="team" scopeId={teamId} />
    <ExtensionFields request={request} teamId={teamId} scope="team" />
    <DisciplineFollowUpTools request={request} teamId={teamId} />
  </section>;
}
