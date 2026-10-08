/** Portable capability definitions and implementations shared by app and scheduled worker. */
export type ActivityCapabilityDefinition = {
  id: string;
  version: string;
  defaults: { notificationsEnabled: boolean };
  field: { key: string; label: string; min: number; max: number };
  appliesTo: { activityTypeSlugs: readonly string[]; categories: readonly string[] };
  notifications: { type: string; beforeStartHours: readonly number[]; recipients: "teamInvitationManagers" };
};

export type TargetTeamSizeCapability = ActivityCapabilityDefinition & {
  id: "targetTeamSize";
  version: "1.0.0";
  defaults: { notificationsEnabled: boolean };
  field: { key: "targetTeamSize"; label: string; min: number; max: number };
  appliesTo: { activityTypeSlugs: readonly string[]; categories: readonly string[] };
  notifications: {
    type: "team_size_shortage";
    beforeStartHours: readonly number[];
    recipients: "teamInvitationManagers";
  };
};

export function targetTeamSize(options: {
  activityTypeSlugs: readonly string[];
  categories: readonly string[];
  beforeStartHours?: readonly number[];
}): TargetTeamSizeCapability {
  const hours = options.beforeStartHours ?? [72, 24];
  if (!hours.length || hours.length > 5 || new Set(hours).size !== hours.length
    || hours.some(hour => !Number.isInteger(hour) || hour < 1 || hour > 720)) {
    throw new Error("Ogiltiga kontrolltider för önskad lagstorlek.");
  }
  if (!options.activityTypeSlugs.length || !options.categories.length) {
    throw new Error("Förmågan måste kopplas till aktivitetstyper.");
  }
  return {
    id: "targetTeamSize", version: "1.0.0", defaults: { notificationsEnabled: false },
    field: { key: "targetTeamSize", label: "Önskad matchtrupp", min: 1, max: 100 },
    appliesTo: { activityTypeSlugs: [...options.activityTypeSlugs], categories: [...options.categories] },
    notifications: { type: "team_size_shortage", beforeStartHours: [...hours].sort((a, b) => b - a), recipients: "teamInvitationManagers" },
  };
}

// Binding belongs to the discipline, not to the generic notification engine.
// Keep this module dependency-free so Deno and Next.js use the same definition.
export const footballCapabilityProfile = {
  key: "football", version: "1.0.0",
  capabilities: [targetTeamSize({ activityTypeSlugs: ["match-tavling"], categories: ["competition"] })],
} as const;

export const disciplineCapabilityProfiles = [footballCapabilityProfile] as const;

export type TeamSizeNotificationPayload = {
  title?: string;
  acceptedPlayers?: number;
  targetTeamSize?: number;
  pendingPlayers?: number;
  responseDeadlinePassed?: boolean;
};

export function teamSizeNotificationContent(payload: TeamSizeNotificationPayload) {
  const accepted = payload.acceptedPlayers ?? 0;
  const target = payload.targetTeamSize ?? 0;
  const pending = payload.pendingPlayers ?? 0;
  const action = pending > 0 && !payload.responseDeadlinePassed
    ? `${pending} spelare har inte svarat. Öppna matchen i Förena för att påminna dem eller kalla fler spelare.`
    : "Öppna matchen i Förena för att kalla fler spelare.";
  return {
    subject: `Matchtruppen behöver fler spelare: ${payload.title || "Match"}`,
    text: `${accepted} av önskade ${target} spelare har tackat ja. Det saknas ${Math.max(0, target - accepted)} spelare. ${action}`,
  };
}

/** Facts supplied by authorized infrastructure, never by a form or assistant. */
export type CapabilityContext = {
  activityId: string;
  teamId: string;
  organizationId: string;
  disciplineKey: string;
  disciplineVersion: string;
  currentDisciplineKey: string;
  definition: ActivityCapabilityDefinition;
  values: Record<string, unknown>;
  evaluatedAt: string;
  title: string;
  startsAt: string;
  responseDueAt: string | null;
  status: string;
  sourceKind: string;
  activityTypeSlug: string;
  category: string;
  acceptedPlayers: number;
  pendingPlayers: number;
  invitedPlayers: number;
  completedCheckpoints: readonly number[];
};

export type CapabilityNotification = {
  activityId: string;
  capabilityId: string;
  beforeStartHours: number;
  type: string;
  payload: Record<string, unknown>;
  message: { subject: string; text: string; url: string; tag: string };
};

/** Runtime API is separate from serializable package definitions and snapshots. */
export interface ActivityCapabilityImplementation {
  readonly id: string;
  readonly version: string;
  validateValue(value: unknown): boolean;
  evaluate(context: CapabilityContext): CapabilityNotification | null;
}

export const targetTeamSizeImplementation: ActivityCapabilityImplementation = {
  id: "targetTeamSize",
  version: "1.0.0",
  validateValue(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 100;
  },
  evaluate(context) {
    const rule = context.definition;
    if (rule.id !== this.id || rule.version !== this.version
      || rule.field.key !== "targetTeamSize"
      || rule.notifications.type !== "team_size_shortage"
      || rule.notifications.recipients !== "teamInvitationManagers"
      || context.currentDisciplineKey !== context.disciplineKey
      || context.status !== "published" || context.sourceKind === "imported"
      || !rule.appliesTo.activityTypeSlugs.includes(context.activityTypeSlug)
      || !rule.appliesTo.categories.includes(context.category)) return null;
    const now = Date.parse(context.evaluatedAt);
    const startsAt = Date.parse(context.startsAt);
    if (!Number.isFinite(now) || !Number.isFinite(startsAt) || startsAt <= now) return null;
    const target = context.values[rule.field.key];
    if (!this.validateValue(target) || context.invitedPlayers === 0 || context.acceptedPlayers >= (target as number)) return null;
    // Choose the closest due checkpoint before checking deduplication: never
    // replay an older alert when the closest checkpoint has already been queued.
    const due = rule.notifications.beforeStartHours.filter(hours => startsAt - hours * 3_600_000 <= now);
    if (!due.length) return null;
    const hours = Math.min(...due);
    if (context.completedCheckpoints.includes(hours)) return null;
    const payload = {
      activityId: context.activityId, teamId: context.teamId, title: context.title,
      startsAt: context.startsAt, capabilityId: this.id, beforeStartHours: hours,
      targetTeamSize: target as number, acceptedPlayers: context.acceptedPlayers, pendingPlayers: context.pendingPlayers,
      responseDeadlinePassed: context.responseDueAt !== null && Date.parse(context.responseDueAt) <= now,
    };
    return {
      activityId: context.activityId, capabilityId: this.id, beforeStartHours: hours,
      type: rule.notifications.type, payload,
      message: { ...teamSizeNotificationContent(payload), url: `/activities/${context.activityId}`,
        tag: `${rule.notifications.type}:${context.activityId}` },
    };
  },
};

/** Register compiled implementations here; definitions remain safe to serialize. */
export const capabilityImplementations = [targetTeamSizeImplementation] as const;

export function evaluateDisciplineCapability(context: CapabilityContext): CapabilityNotification | null {
  const profile = disciplineCapabilityProfiles.find(item => item.key === context.disciplineKey && item.version === context.disciplineVersion);
  if (!profile?.capabilities.some(item => item.id === context.definition.id && item.version === context.definition.version)) return null;
  return capabilityImplementations.find(item => item.id === context.definition.id && item.version === context.definition.version)?.evaluate(context) ?? null;
}

/** Pagination must progress even when an entire page produces no notifications. */
export async function collectCapabilityNotifications(
  load: (afterActivityId: string | null, afterCapabilityId: string) => Promise<CapabilityContext[]>,
): Promise<CapabilityNotification[]> {
  const proposals: CapabilityNotification[] = [];
  let afterActivityId: string | null = null;
  let afterCapabilityId = "";
  while (proposals.length < 500) {
    const contexts = await load(afterActivityId, afterCapabilityId);
    if (!contexts.length) break;
    for (const context of contexts) {
      const proposal = evaluateDisciplineCapability(context);
      if (proposal) proposals.push(proposal);
      if (proposals.length === 500) return proposals;
    }
    const last = contexts[contexts.length - 1];
    if (last.activityId === afterActivityId && last.definition.id === afterCapabilityId) throw new Error("Capability cursor did not advance");
    afterActivityId = last.activityId;
    afterCapabilityId = last.definition.id;
  }
  return proposals;
}
