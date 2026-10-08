import { getDisciplineRuntime } from "./disciplines/registry.ts";
import { planDisciplineActivity,type DisciplineActivityEvent } from "./discipline-lifecycle.ts";
type RpcResult={data:unknown;error:unknown};
export interface DisciplineEventClient { rpc(name:string,args:Record<string,unknown>):PromiseLike<RpcResult> }
/** Leased, ordered events are acknowledged with their operations in one transaction. */
export async function processDisciplineActivityEvents(client:DisciplineEventClient) {
  let processed=0,failed=0;
  for(let batch=0;batch<10;batch++) {
    const claimed=await client.rpc("claim_discipline_activity_events",{batch_size:100});
    if(claimed.error) throw new Error("Could not claim discipline events");
    const events=claimed.data as DisciplineActivityEvent[];
    if(!events?.length) break;
    for(const event of events) {
      try {
        const runtime=getDisciplineRuntime(event.disciplineKey,event.disciplineVersion);
        // Unregistered/removed disciplines can cancel old work, never inherit another package.
        const operations=runtime ? planDisciplineActivity(runtime,event)
          : event.savedRules.map(rule=>({kind:"cancel",capabilityId:rule.id}));
        const applied=await client.rpc("apply_discipline_activity_event",{event_id:event.id,lease_token:event.leaseToken,operations});
        if(applied.error || applied.data!==true) throw new Error("Could not apply discipline event");
        processed++;
      } catch {
        const result=await client.rpc("fail_discipline_activity_event",{event_id:event.id,lease_token:event.leaseToken});
        if(result.error) throw new Error("Could not persist discipline retry");
        failed++;
      }
    }
  }
  return {processed,failed};
}
