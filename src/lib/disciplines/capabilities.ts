import { z } from "zod";
import { targetTeamSizeField } from "../../../supabase/functions/_shared/target-team-size";
export { targetTeamSize, type TargetTeamSizeCapability } from "../../../supabase/functions/_shared/target-team-size";
const field = targetTeamSizeField;
export const targetTeamSizeSchema = z.number().int().min(field.min).max(field.max).meta({title:field.label}).optional();
