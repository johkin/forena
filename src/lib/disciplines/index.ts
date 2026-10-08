import type { PlayerReferenceContext } from "./field-rules";
import type { DisciplineScope } from "./types";
import { disciplineRegistrations } from "@/disciplines/registry";
export { disciplineScopeNames, type DisciplineScope, type DisciplinePackage } from "./types";
export function getDisciplineRegistration(key: string,version?: string) {
  return disciplineRegistrations.find(item => item.definition.key===key && (version===undefined || item.definition.version===version)) ?? null;
}
export function getDisciplinePackage(key: string,version?: string) {
  return getDisciplineRegistration(key,version)?.definition ?? null;
}
export function validateDisciplineData(key: string,version: string,scope: DisciplineScope,input: unknown,context?: PlayerReferenceContext) {
  const registration=getDisciplineRegistration(key,version);
  if (!registration) throw new Error("Disciplinversionen stöds inte.");
  return registration.validate(scope,input,context);
}
export function packageForSection(sectionDisciplineId: string|null,effectiveDisciplineId: string|null,catalogue: readonly {id:string;key:string}[]) {
  if (!sectionDisciplineId || sectionDisciplineId!==effectiveDisciplineId) return null;
  const discipline=catalogue.find(item => item.id===sectionDisciplineId);
  return discipline ? getDisciplinePackage(discipline.key) : null;
}
