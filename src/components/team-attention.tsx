"use client";

import type { ParticipationFetch } from "./activity-invitation-response";
import type { NavigationLink } from "./navigation-link";
import { TeamCapabilitySignals } from "./team-capability-signals";
import { TeamFollowUp } from "./team-follow-up";

/** Each endpoint enforces its own team permission, including mixed family/leader access. */
export function TeamAttention({ teams, request, refreshKey, linkComponent }: {
  teams: { id: string; name: string }[];
  request: ParticipationFetch;
  refreshKey?: string;
  linkComponent?: NavigationLink;
}) {
  return <div className="team-attention">
    {teams.map(team => <div key={team.id}>
      <TeamCapabilitySignals teamId={team.id} teamName={team.name} request={request}
        refreshKey={refreshKey} activeOnly linkComponent={linkComponent} />
      <TeamFollowUp teamId={team.id} teamName={team.name} request={request}
        refreshKey={refreshKey} attentionOnly linkComponent={linkComponent} />
    </div>)}
  </div>;
}
