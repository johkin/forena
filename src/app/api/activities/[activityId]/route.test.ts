import { beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_DISCIPLINE_DEFAULTS } from "@/lib/discipline-defaults";
import { scheduleActivityTimes } from "@/lib/activity-time-rules";
const mocks=vi.hoisted(()=>({client:vi.fn(),update:vi.fn(),type:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:mocks.client}));
vi.mock("@/lib/activity-configuration",()=>({requireActivityType:mocks.type}));
import { PUT } from "./route";
const rules={...BASE_DISCIPLINE_DEFAULTS, duration:"PT60M", gatheringRule:"start", invitationRule:"start-6d", responseDueRule:"start-6h", reminderRules:["deadline-2h"]};
const start="2030-10-20T16:00:00Z";
const times=scheduleActivityTimes(start,"Europe/Stockholm",rules);
let current: Record<string,unknown>;
let client: {from:ReturnType<typeof vi.fn>; rpc:ReturnType<typeof vi.fn>; auth:unknown};
beforeEach(()=>{
 vi.clearAllMocks(); current={id:"activity",organization_id:"org",team_id:"team",activity_type_id:"type",status:"published",source_kind:"manual",starts_at:start, invitation_materialized_at:null, invitation_send_at:times.invitationSendAt,response_due_at:times.responseDueAt,reminder_send_at:null,reminder_send_ats:times.reminderSendAts};
 const activities={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn(async()=>({data:current,error:null})),update:mocks.update,single:vi.fn(async()=>({data:{id:"activity"},error:null}))};
 activities.select.mockReturnValue(activities);activities.eq.mockReturnValue(activities);mocks.update.mockReturnValue(activities);
 const org={select:vi.fn(),eq:vi.fn(),single:vi.fn(async()=>({data:{time_zone:"Europe/Stockholm"},error:null}))};org.select.mockReturnValue(org);org.eq.mockReturnValue(org);
 client={auth:{getUser:vi.fn(async()=>({data:{user:{id:"leader"}}}))},rpc:vi.fn(async()=>({data:true,error:null})),from:vi.fn(table=>table==="organizations"?org:activities)};mocks.client.mockResolvedValue(client);
});
async function put(changes:Record<string,unknown>={}) { return PUT(new Request("https://example.test/api/activities/activity",{method:"PUT",body:JSON.stringify({title:"Updated",startsAt:start,endsAt:times.endsAt,gatheringAt:times.gatheringAt,timingRules:rules,...changes})}),{params:Promise.resolve({activityId:"activity"})}); }
describe("concrete activity times",()=>{
 it.each([null,"2030-10-14T16:01:00Z"])("edits explicit timestamps without changing pending or sent invitation schedules",async materialized=>{
  current.invitation_materialized_at=materialized;
  const response=await put({startsAt:"2030-10-21T16:00:00Z",endsAt:"2030-10-21T18:00:00Z",gatheringAt:"2030-10-21T15:45:00Z"});
  expect(response.status).toBe(200);
  const patch=mocks.update.mock.calls[0][0];
  expect(patch).toMatchObject({starts_at:"2030-10-21T16:00:00.000Z",ends_at:"2030-10-21T18:00:00.000Z",gathering_at:"2030-10-21T15:45:00.000Z"});
  for(const key of ["timing_rules","timing_rule_version","invitation_send_at","response_due_at","reminder_send_at","reminder_send_ats","invitation_materialized_at"])expect(patch).not.toHaveProperty(key);
 });
 it("ignores obsolete rule metadata from an older client",async()=>{expect((await put({timingRules:{invalid:true}})).status).toBe(200);expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("timing_rules");});
 it("rejects invalid concrete times without writing",async()=>{expect((await put({endsAt:start})).status).toBe(400);expect(mocks.update).not.toHaveBeenCalled();});
});
