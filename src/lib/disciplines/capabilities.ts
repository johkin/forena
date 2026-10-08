import { z } from "zod";
import { footballCapabilityProfile } from "../../../supabase/functions/_shared/discipline-capabilities";

export { targetTeamSize, type TargetTeamSizeCapability } from "../../../supabase/functions/_shared/discipline-capabilities";
export const footballCapabilities = footballCapabilityProfile.capabilities;

const field = footballCapabilities[0].field;
export const targetTeamSizeSchema = z.number().int().min(field.min).max(field.max)
  .meta({ title: field.label }).optional();
