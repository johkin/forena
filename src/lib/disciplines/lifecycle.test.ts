import { describe,expect,it,vi } from "vitest";
import { footballRuntime,footballCapabilityProfile } from "../../../supabase/functions/_shared/disciplines/football";
import { planDisciplineActivity,type DisciplineActivityEvent,type DisciplineRuntime } from "../../../supabase/functions/_shared/discipline-lifecycle";
import { processDisciplineActivityEvents } from "../../../supabase/functions/_shared/discipline-event-worker";
const binding=footballCapabilityProfile.capabilities[0];
const event:DisciplineActivityEvent={
  id:1,leaseToken:"lease",kind:"activity.created",disciplineKey:"football",disciplineVersion:"1.0.0",disciplineId:"discipline",
  previous:null,current:{id:"activity",teamId:"team",organizationId:"club",title:"Match",startsAt:"2026-10-10T12:00:00Z",endsAt:"2026-10-10T13:00:00Z",status:"published",sourceKind:"manual",activityTypeSlug:"match-tavling",category:"competition"},
  teamValues:{gameFormat:"7v7",targetTeamSize:9},sectionSettings:{targetTeamSize:{notificationsEnabled:true}},teamSettings:{},savedRules:[],
};
describe("discipline lifecycle",()=>{
  it("initializes values and schedules the capability on creation",()=>{
    const operations=planDisciplineActivity(footballRuntime,event);
    expect(operations[0]).toEqual({kind:"initializeValues",values:{gameFormat:"7v7",targetTeamSize:9,captainSource:"acceptedActivityPlayers"}});
    expect(operations.filter(op=>op.kind==="schedule")).toMatchObject([
      {beforeStartHours:72,runAt:"2026-10-07T12:00:00.000Z"},{beforeStartHours:24,runAt:"2026-10-09T12:00:00.000Z"},
    ]);
  });
  it("honors explicit off and empty checkpoint settings",()=>{
    for(const settings of [{notificationsEnabled:false},{notificationHours:[]}]) {
      expect(planDisciplineActivity(footballRuntime,{...event,teamSettings:{targetTeamSize:settings}}).some(op=>op.kind==="schedule")).toBe(false);
    }
  });
  it("moves saved checkpoints on update while preserving values and original settings",()=>{
    const updated={...event,kind:"activity.updated" as const,previous:event.current,
      current:{...event.current,startsAt:"2026-10-12T12:00:00Z"},teamValues:{targetTeamSize:99},
      teamSettings:{targetTeamSize:{notificationsEnabled:false,notificationHours:[12]}},savedRules:[binding]};
    const operations=planDisciplineActivity(footballRuntime,updated);
    expect(operations.some(op=>op.kind==="initializeValues" || op.kind==="saveValues")).toBe(false);
    expect(operations[0]).toEqual({kind:"cancel",capabilityId:"targetTeamSize"});
    expect(operations.filter(op=>op.kind==="schedule")).toMatchObject([
      {beforeStartHours:72,runAt:"2026-10-09T12:00:00.000Z"},{beforeStartHours:24,runAt:"2026-10-11T12:00:00.000Z"},
    ]);
  });
  it.each([{status:"cancelled"},{sourceKind:"imported"},{activityTypeSlug:"traning"}])("cancels remaining work for %j",override=>{
    expect(planDisciplineActivity(footballRuntime,{...event,kind:"activity.updated",previous:event.current,current:{...event.current,...override},savedRules:[binding]}))
      .toEqual([{kind:"cancel",capabilityId:"targetTeamSize"}]);
  });
  it("does not initialize football values on another activity type",()=>{
    expect(planDisciplineActivity(footballRuntime,{...event,current:{...event.current,activityTypeSlug:"traning"}}).some(op=>op.kind==="initializeValues")).toBe(false);
  });
  it("lets a different package save information through the same API",()=>{
    const runtime:DisciplineRuntime={definition:{key:"other-sport",version:"2",capabilities:[]},capabilities:[],
      onActivity(received,api){ expect(received.current.id).toBe("activity");api.saveValues({lane:3},4); }};
    expect(planDisciplineActivity(runtime,{...event,disciplineKey:"other-sport",disciplineVersion:"2"})).toEqual([{kind:"saveValues",values:{lane:3},expectedRevision:4}]);
    expect(()=>planDisciplineActivity(runtime,event)).toThrow("Unsupported discipline event");
  });
  it("acknowledges generated operations and leaves retries to the persistent adapter",async()=>{
    const rpc=vi.fn().mockResolvedValueOnce({data:[event],error:null})
      .mockResolvedValueOnce({data:true,error:null}).mockResolvedValueOnce({data:[],error:null});
    expect(await processDisciplineActivityEvents({rpc})).toEqual({processed:1,failed:0});
    expect(rpc.mock.calls[1]).toEqual(["apply_discipline_activity_event",{event_id:1,lease_token:"lease",operations:planDisciplineActivity(footballRuntime,event)}]);
  });
  it("persists one handler failure and continues another activity",async()=>{
    const rpc=vi.fn().mockResolvedValueOnce({data:[event,{...event,id:2}],error:null})
      .mockResolvedValueOnce({data:null,error:{code:"40001"}}).mockResolvedValueOnce({data:true,error:null})
      .mockResolvedValueOnce({data:true,error:null}).mockResolvedValueOnce({data:[],error:null});
    expect(await processDisciplineActivityEvents({rpc})).toEqual({processed:1,failed:1});
    expect(rpc.mock.calls[2][0]).toBe("fail_discipline_activity_event");
  });
});
