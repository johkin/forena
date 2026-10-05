export type ReminderAssessment = {
  teamId: string;
  activityId: string;
  title: string;
  activityType: string;
  startsAt: string;
  responseDueAt: string | null;
  accepted: number;
  declined: number;
  pending: number;
  acceptedPlayers: number;
  pendingPlayers: number;
  lastReminderAt: string | null;
  canRemind: boolean;
  blockedReason: string | null;
  fingerprint: string;
};

export type ReminderMemory = {
  scope: string;
  subject: string;
  content: string;
  disciplineId: string | null;
};

export type ReminderDraft = {
  timeZone: string;
  assessment: ReminderAssessment;
  reason: string;
  memories: ReminderMemory[];
};
