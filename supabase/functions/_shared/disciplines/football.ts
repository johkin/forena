import { targetTeamSize, targetTeamSizeImplementation, reconcileTargetTeamSize } from "../target-team-size.ts";
import type { DisciplineRuntime } from "../discipline-lifecycle.ts";
export const footballCapabilityProfile = {
  key:"football",version:"1.0.0",
  capabilities:[targetTeamSize({activityTypeSlugs:["match-tavling"],categories:["competition"]})],
} as const;
export const footballRuntime:DisciplineRuntime = {
  definition:footballCapabilityProfile,capabilities:[targetTeamSizeImplementation],
  onActivity(event,api) {
    if (event.kind==="activity.created" && event.current.activityTypeSlug==="match-tavling" && event.current.category==="competition") {
      api.initializeValues({...event.teamValues,captainSource:"acceptedActivityPlayers"});
    }
    for (const capability of footballCapabilityProfile.capabilities) reconcileTargetTeamSize(event,api,capability);
  },
};
