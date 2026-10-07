import type { PlayerReferenceContext } from "./field-rules";
import { footballPackage, validateFootballData, type DisciplineScope } from "./football";

export { disciplineScopeNames, type DisciplineScope } from "./football";
export type DisciplinePackage = typeof footballPackage;

// Retain old versions here when new schemas are introduced; never silently
// interpret saved data using a newer version. Unknown catalogue keys are valid
// legacy disciplines, but do not have a code-owned package yet.
export function getDisciplinePackage(key: string, version = "1.0.0"): DisciplinePackage | null {
  return key === footballPackage.key && version === footballPackage.version ? footballPackage : null;
}

export function validateDisciplineData(key: string, version: string, scope: DisciplineScope, input: unknown, context?: PlayerReferenceContext) {
  if (!getDisciplinePackage(key, version)) throw new Error("Disciplinversionen stöds inte.");
  return validateFootballData(scope, input, context);
}

export function packageForSection(
  sectionDisciplineId: string | null,
  effectiveDisciplineId: string | null,
  catalogue: readonly { id: string; key: string }[],
): DisciplinePackage | null {
  // Do not accidentally apply a section's schema to a legacy team override.
  if (!sectionDisciplineId || sectionDisciplineId !== effectiveDisciplineId) return null;
  const discipline = catalogue.find(item => item.id === sectionDisciplineId);
  return discipline ? getDisciplinePackage(discipline.key) : null;
}
