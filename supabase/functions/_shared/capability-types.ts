/** Portable capability definitions and implementations shared by app and scheduled worker. */
export type ActivityCapabilityDefinition = {
  id: string;
  version: string;
  defaults: { notificationsEnabled: boolean };
  field: { key: string; label: string; min: number; max: number };
  appliesTo: { activityTypeSlugs: readonly string[]; categories: readonly string[] };
  notifications: { type: string; beforeStartHours: readonly number[]; recipients: "teamInvitationManagers" };
};

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
