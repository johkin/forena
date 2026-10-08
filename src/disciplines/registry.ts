import { footballPackage, footballSchemas, validateFootballData } from "./football/definition";
import type { DisciplineRegistration } from "@/lib/disciplines/types";
/** Explicit compiled package registration; the kernel dispatches through this contract. */
export const disciplineRegistrations: readonly DisciplineRegistration[] = [
  { definition: footballPackage, schemas: footballSchemas, validate: validateFootballData },
];
