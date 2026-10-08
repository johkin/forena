/** Portable, declarative DSL shared by the app and the notification worker. */
export type TargetTeamSizeCapability = {
  id: "targetTeamSize";
  version: "1.0.0";
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
    id: "targetTeamSize", version: "1.0.0",
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
