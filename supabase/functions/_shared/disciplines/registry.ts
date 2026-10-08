import { footballRuntime } from "./football.ts";
import type { DisciplineRuntime } from "../discipline-lifecycle.ts";
export const disciplineRuntimes:readonly DisciplineRuntime[]=[footballRuntime];
export function getDisciplineRuntime(key:string,version:string) {
  return disciplineRuntimes.find(runtime=>runtime.definition.key===key && runtime.definition.version===version);
}
