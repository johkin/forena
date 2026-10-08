import type { CapabilityContext, CapabilityNotification } from "./capability-types.ts";
import { disciplineRuntimes } from "./disciplines/registry.ts";
export * from "./capability-types.ts";
export { targetTeamSize, targetTeamSizeImplementation, teamSizeNotificationContent, type TargetTeamSizeCapability } from "./target-team-size.ts";
export const disciplineCapabilityProfiles = disciplineRuntimes.map(runtime => runtime.definition);
const capabilityImplementations = disciplineRuntimes.flatMap(runtime => runtime.capabilities);
export function evaluateDisciplineCapability(context: CapabilityContext): CapabilityNotification | null {
  const profile = disciplineCapabilityProfiles.find(item => item.key === context.disciplineKey && item.version === context.disciplineVersion);
  if (!profile?.capabilities.some(item => item.id === context.definition.id && item.version === context.definition.version)) return null;
  const proposal=capabilityImplementations.find(item => item.id === context.definition.id && item.version === context.definition.version)?.evaluate(context);
  return proposal ? { ...proposal,activityGeneration:context.activityGeneration,disciplineKey:context.disciplineKey,disciplineVersion:context.disciplineVersion } : null;
}

/** Pagination must progress even when an entire page produces no notifications. */
export async function collectCapabilityNotifications(
  load: (afterActivityId: string | null, afterCapabilityId: string) => Promise<CapabilityContext[]>,
): Promise<CapabilityNotification[]> {
  const proposals: CapabilityNotification[] = [];
  let afterActivityId: string | null = null;
  let afterCapabilityId = "";
  let examined = 0;
  while (examined < 500) {
    const contexts = await load(afterActivityId, afterCapabilityId);
    if (!contexts.length) break;
    for (const context of contexts) {
      examined++;
      const proposal = evaluateDisciplineCapability(context);
      if (proposal) proposals.push(proposal);
      if (examined === 500) return proposals;
    }
    const last = contexts[contexts.length - 1];
    if (last.activityId === afterActivityId && last.definition.id === afterCapabilityId) throw new Error("Capability cursor did not advance");
    afterActivityId = last.activityId;
    afterCapabilityId = last.definition.id;
  }
  return proposals;
}
