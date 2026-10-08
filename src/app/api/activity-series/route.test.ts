import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BASE_DISCIPLINE_DEFAULTS } from "@/lib/discipline-defaults";

const mocks = vi.hoisted(()=>({client:vi.fn(),type:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:mocks.client}));
vi.mock("@/lib/activity-configuration",()=>({requireActivityType:mocks.type}));
import { POST } from "./route";

function setup() {
 const inserts: Record<string, unknown[]> = {};
 const from = vi.fn((table:string)=>{
  let inserted: unknown;
  const data=()=>table==="teams"?{id:"team",organization_id:"org"}:table==="organizations"?{time_zone:"Europe/Stockholm"}:table==="activity_series"?{id:"series"}:table==="activities"?(inserted as object[]).map((item,i)=>({...item,id:`activity-${i}`})):[];
  const result=()=>({data:data(),error:null});
  const builder={select:vi.fn(),eq:vi.fn(),delete:vi.fn(),insert:vi.fn((value:unknown)=>{inserted=value;(inserts[table]??=[]).push(value);return builder;}),
   maybeSingle:vi.fn(async()=>result()),single:vi.fn(async()=>result()),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)};
  for(const method of [builder.select,builder.eq,builder.delete])method.mockReturnValue(builder);
  return builder;
 });
 mocks.client.mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:"user"}}})},from,rpc:vi.fn(async()=>({data:true,error:null}))});
 mocks.type.mockResolvedValue({id:"training"});
 return inserts;
}
const body={teamId:"team",activityTypeId:"training",title:"Träning",startsOn:"2026-10-09",endsOn:"2026-10-16",weekdays:[5],startTime:"16:15",invitationAudience:"players",
 timingRules:{...BASE_DISCIPLINE_DEFAULTS,duration:"PT60M",invitationRule:"start-6d",responseDueRule:"start-6h",reminderRules:["deadline-5d","deadline-2d"]}};
const request=(value:object)=>new Request("http://localhost/api/activity-series",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(value)});
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-06T10:00:00Z"));});
afterEach(()=>vi.useRealTimers());

it("persists an immediate first invitation and the original offset for the next occurrence",async()=>{
 const inserts=setup();
 const response=await POST(request(body));
 expect(response.status).toBe(201);
 const activities=inserts.activities[0] as Record<string,unknown>[];
 expect(activities[0]).toMatchObject({invitation_send_at:"2026-10-06T10:00:00.000Z",response_due_at:"2026-10-09T08:15:00.000Z",reminder_send_ats:["2026-10-07T08:15:00.000Z"]});
 expect(activities[1]).toMatchObject({invitation_send_at:"2026-10-10T14:15:00.000Z",reminder_send_ats:["2026-10-11T08:15:00.000Z","2026-10-14T08:15:00.000Z"]});
 expect((inserts.activity_events[0] as Record<string,unknown>[])[0]).toMatchObject({event_type:"invitation_scheduled",metadata:{scheduledAt:"2026-10-06T10:00:00.000Z"}});
});
it("rejects elapsed deadlines before writing any series or activities",async()=>{
 const inserts=setup();
 const response=await POST(request({...body,startsOn:"2026-10-06",endsOn:"2026-10-06",weekdays:[2],startTime:"11:00"}));
 expect(response.status).toBe(400);
 expect(await response.json()).toHaveProperty("error",expect.stringContaining("Sista svarstid har passerat"));
 expect(inserts).toEqual({});
});
