import type { ActivityCapabilityDefinition, ActivityCapabilityImplementation } from "./capability-types.ts";
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

export const targetTeamSizeField = { key:"targetTeamSize",label:"Önskad matchtrupp",min:1,max:100 } as const;

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
    field: { ...targetTeamSizeField },
    appliesTo: { activityTypeSlugs: [...options.activityTypeSlugs], categories: [...options.categories] },
    notifications: { type: "team_size_shortage", beforeStartHours: [...hours].sort((a, b) => b - a), recipients: "teamInvitationManagers" },
  };
}

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

export const targetTeamSizeImplementation: ActivityCapabilityImplementation = {
  id: "targetTeamSize",
  version: "1.0.0",
  validateValue(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= targetTeamSizeField.min && value <= targetTeamSizeField.max;
  },
  evaluateSignal(context) {
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
    // A shortage becomes actionable at the first configured checkpoint.
    if (!rule.notifications.beforeStartHours.some(hours => startsAt - hours * 3_600_000 <= now)) return null;
    const deadlinePassed = context.responseDueAt !== null && Date.parse(context.responseDueAt) <= now;
    const lastReminder = context.lastReminderAt ? Date.parse(context.lastReminderAt) : NaN;
    const canRemind = context.pendingPlayers > 0 && !deadlinePassed
      && (!Number.isFinite(lastReminder) || now - lastReminder >= 3_600_000);
    return {
      capabilityId: this.id, type: "team_size_shortage",
      severity: startsAt - now <= 24 * 3_600_000 ? "warning" : "info",
      title: "Få spelare anmälda till matchen",
      text: `${context.acceptedPlayers} av önskade ${target} spelare har tackat ja. ${context.pendingPlayers} spelare har ännu inte svarat.`,
      facts: { acceptedPlayers: context.acceptedPlayers, targetTeamSize: target,
        pendingPlayers: context.pendingPlayers, responseDeadlinePassed: deadlinePassed },
      actions: [...(canRemind ? [{ id: "remind-unanswered" as const, label: "Påminn obesvarade" }] : []),
        { id: "invite-more-players", label: "Kalla fler spelare" }],
    };
  },
  nextSignalEvaluationAt(context) {
    const rule = context.definition;
    const now = Date.parse(context.evaluatedAt);
    const start = Date.parse(context.startsAt);
    if (rule.id !== this.id || rule.version !== this.version
      || context.currentDisciplineKey !== context.disciplineKey
      || context.status !== "published" || context.sourceKind === "imported"
      || !rule.appliesTo.activityTypeSlugs.includes(context.activityTypeSlug)
      || !rule.appliesTo.categories.includes(context.category)
      || !this.validateValue(context.values[rule.field.key]) || context.invitedPlayers === 0
      || !Number.isFinite(now) || !Number.isFinite(start) || start <= now) return null;
    const candidates = rule.notifications.beforeStartHours.map(hours => start - hours * 3_600_000);
    // Time-dependent signal presentation/actions only matter while there is a shortage.
    if (this.evaluateSignal(context)) {
      candidates.push(start - 24 * 3_600_000, start);
      if (context.responseDueAt) candidates.push(Date.parse(context.responseDueAt));
      if (context.lastReminderAt) candidates.push(Date.parse(context.lastReminderAt) + 3_600_000);
    }
    const future = candidates.filter(time => Number.isFinite(time) && time > now && time <= start);
    return future.length ? new Date(Math.min(...future)).toISOString() : null;
  },
  evaluate(context) {
    const signal = this.evaluateSignal(context);
    if (!signal) return null;
    const rule = context.definition;
    const now = Date.parse(context.evaluatedAt);
    const startsAt = Date.parse(context.startsAt);
    const target = context.values[rule.field.key];
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


import type { DisciplineActivityEvent, DisciplineActivityApi } from "./discipline-lifecycle.ts";
/** A creation snapshot owns its settings; later activity changes only move/cancel work. */
export function reconcileTargetTeamSize(event:DisciplineActivityEvent,api:DisciplineActivityApi,binding:ActivityCapabilityDefinition) {
  const activity=event.current;
  const saved=event.savedRules.find(rule=>rule.id===binding.id);
  const section=event.sectionSettings[binding.id];
  const team=event.teamSettings[binding.id];
  const enabled=team?.notificationsEnabled ?? section?.notificationsEnabled ?? binding.defaults.notificationsEnabled;
  const hours=team?.notificationHours ?? section?.notificationHours ?? binding.notifications.beforeStartHours;
  const rule=saved ?? (event.kind==="activity.created" && enabled && hours.length
    ? {...binding,notifications:{...binding.notifications,beforeStartHours:[...hours]}} : undefined);
  api.cancel(binding.id);
  if (!rule || activity.status==="cancelled" || activity.sourceKind==="imported"
    || !rule.appliesTo.activityTypeSlugs.includes(activity.activityTypeSlug)
    || !rule.appliesTo.categories.includes(activity.category)) return;
  for (const beforeStartHours of rule.notifications.beforeStartHours) {
    api.schedule(rule,beforeStartHours,new Date(Date.parse(activity.startsAt)-beforeStartHours*3_600_000).toISOString());
  }
}
