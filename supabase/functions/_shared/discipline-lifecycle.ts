import type { ActivityCapabilityDefinition, ActivityCapabilityImplementation } from "./capability-types.ts";
export type DisciplineActivity = {
  id:string; teamId:string; organizationId:string; title:string; startsAt:string; endsAt:string;
  description?:string|null;location?:string|null;responseDueAt?:string|null;gatheringAt?:string|null;invitationSendAt?:string|null;
  status:string; sourceKind:string; activityTypeSlug:string; category:string;
};
export type DisciplineActivityEvent = {
  id:number; leaseToken:string; kind:"activity.created"|"activity.updated";
  disciplineKey:string; disciplineVersion:string; disciplineId:string;
  previous:DisciplineActivity|null; current:DisciplineActivity;
  teamValues:Record<string,unknown>; sectionSettings:Record<string,CapabilitySettings>;
  teamSettings:Record<string,CapabilitySettings>; savedRules:ActivityCapabilityDefinition[];
};
export type CapabilitySettings = { notificationsEnabled?:boolean|null; notificationHours?:number[]|null };
export type DisciplineOperation =
  | {kind:"initializeValues";values:Record<string,unknown>}
  | {kind:"saveValues";values:Record<string,unknown>;expectedRevision:number}
  | {kind:"schedule";definition:ActivityCapabilityDefinition;runAt:string;beforeStartHours:number}
  | {kind:"cancel";capabilityId:string};
export interface DisciplineActivityApi {
  initializeValues(values:Record<string,unknown>):void;
  saveValues(values:Record<string,unknown>,expectedRevision:number):void;
  schedule(definition:ActivityCapabilityDefinition,beforeStartHours:number,runAt:string):void;
  cancel(capabilityId:string):void;
}
export interface DisciplineRuntime {
  definition:{key:string;version:string;capabilities:readonly ActivityCapabilityDefinition[]};
  capabilities:readonly ActivityCapabilityImplementation[];
  onActivity(event:DisciplineActivityEvent,api:DisciplineActivityApi):void;
}
/** No SQL, arbitrary recipient IDs or remote endpoints in a package's API. */
export function planDisciplineActivity(runtime:DisciplineRuntime,event:DisciplineActivityEvent):DisciplineOperation[] {
  if (runtime.definition.key!==event.disciplineKey || runtime.definition.version!==event.disciplineVersion) throw new Error("Unsupported discipline event");
  const operations:DisciplineOperation[]=[];
  runtime.onActivity(event,{
    initializeValues:values=>operations.push({kind:"initializeValues",values}),
    saveValues:(values,expectedRevision)=>operations.push({kind:"saveValues",values,expectedRevision}),
    schedule:(definition,beforeStartHours,runAt)=>operations.push({kind:"schedule",definition,beforeStartHours,runAt}),
    cancel:capabilityId=>operations.push({kind:"cancel",capabilityId}),
  });
  return operations;
}
