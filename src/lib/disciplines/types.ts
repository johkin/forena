import type { z } from "zod";
import type { commonActivityProfile } from "./common-activities";
import type { PlayerReferenceContext, PlayerReferenceRule } from "./field-rules";
import type { ActivityCapabilityDefinition } from "../../../supabase/functions/_shared/capability-types";
export type DisciplineScope = "section" | "team" | "teamMembership" | "activity" | "activityParticipation";
export const disciplineScopeNames: Record<DisciplineScope,string> = {
  section:"Sektion",team:"Lag",teamMembership:"Lagmedlemskap",activity:"Aktivitet",activityParticipation:"Aktivitetsdeltagande",
};
export type DisciplinePackage = {
  key: string; version: string; name: string; category: string; assignmentScope: "section";
  activityProfile: typeof commonActivityProfile;
  capabilities: readonly ActivityCapabilityDefinition[];
  schemas: Record<string,z.core.JSONSchema.JSONSchema>;
  fieldRules: { activity: Record<string,PlayerReferenceRule> };
  ui: Record<DisciplineScope,{ fields: readonly string[]; categories?: readonly string[] }>;
  presentation: { description:string; groups:readonly {label:string;values:readonly string[]}[] };
};
export type DisciplineRegistration = {
  definition: DisciplinePackage;
  validate: (scope: DisciplineScope,input: unknown,context?: PlayerReferenceContext) => unknown;
  schemas: Record<DisciplineScope,z.ZodType>;
};
