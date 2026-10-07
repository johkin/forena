/** Declarative selection rules; option data must be loaded by an authorized server command. */
export type PlayerSource = "teamPlayers" | "acceptedActivityPlayers";
export type ActivityFieldContext = {
  activityTypeSlug: string;
  activityCategory: string;
};
export type PlayerReferenceRule = {
  entity: "person";
  role: "player";
  defaultSource: PlayerSource;
  allowedSources: readonly PlayerSource[];
  appliesTo: { activityTypeSlugs: readonly string[]; categories: readonly string[] };
};
/** Never accept this context from a form/model: derive it from the target and current access. */
export type PlayerReferenceContext = ActivityFieldContext & {
  source: PlayerSource;
  eligiblePersonIds: readonly string[];
};

export function playerFieldApplies(rule: PlayerReferenceRule, context: ActivityFieldContext) {
  return rule.appliesTo.activityTypeSlugs.includes(context.activityTypeSlug)
    && rule.appliesTo.categories.includes(context.activityCategory);
}

export function validatePlayerReference(personId: string, rule: PlayerReferenceRule, context?: PlayerReferenceContext) {
  if (!context || !playerFieldApplies(rule, context)) throw new Error("Fältet gäller bara matchaktiviteter.");
  if (!rule.allowedSources.includes(context.source)) throw new Error("Ogiltig källa för spelarval.");
  if (!context.eligiblePersonIds.includes(personId)) throw new Error("Spelaren finns inte bland de valbara spelarna.");
}
