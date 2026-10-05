import { beforeEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_ACTIVITY_DEFAULTS } from "@/lib/activity-defaults";
import { scheduleActivityTimes } from "@/lib/activity-time-rules";
const mocks=vi.hoisted(()=>({client:vi.fn(),update:vi.fn(),type:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:mocks.client}));
vi.mock("@/lib/activity-configuration",()=>({requireActivityType:mocks.type}));
import { PUT } from "./route";
const rules={...FALLBACK_ACTIVITY_DEFAULTS, duration:"PT60M", gatheringRule:"start", invitationRule:"start-6d", responseDueRule:"start-6h", reminderRules:["deadline-2h"]};
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
describe("fixed invitation times during activity edits",()=>{
 it.each([ {invitationRule:"start-7d"}, {responseDueRule:"start-5h"}, {reminderRules:["deadline-1h"]} ])("rejects rules that contradict a pending schedule",async changed=>{const result=await put({timingRules:{...rules,...changed}});expect(result.status).toBe(409);expect(mocks.update).not.toHaveBeenCalled();});
 it("preserves all schedule columns on a title edit with unchanged rules",async()=>{expect((await put()).status).toBe(200);const patch=mocks.update.mock.calls[0][0]; for(const key of ["invitation_send_at","response_due_at","reminder_send_at","reminder_send_ats","invitation_materialized_at"]) expect(patch).not.toHaveProperty(key);});
 it("rejects a moved start when it contradicts the saved schedule",async()=>{const shifted=scheduleActivityTimes("2030-10-21T16:00:00Z","Europe/Stockholm",rules);expect((await put({startsAt:shifted.startsAt,endsAt:shifted.endsAt})).status).toBe(409);expect(mocks.update).not.toHaveBeenCalled();});
 it("rejects moving a legacy pending activity without supplied rules",async()=>{expect((await put({startsAt:"2030-10-21T16:00:00Z",endsAt:"2030-10-21T17:00:00Z",timingRules:undefined})).status).toBe(409);expect(mocks.update).not.toHaveBeenCalled();});
 it("allows a legacy title edit without applying any new timing rules",async()=>{expect((await put({timingRules:undefined})).status).toBe(200);expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("timing_rules");expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("invitation_send_at");});
 it("allows new rules on an activity without a scheduled invitation without scheduling anything",async()=>{current.invitation_send_at=null;expect((await put({timingRules:{...rules,invitationRule:"start-7d"}})).status).toBe(200);expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("invitation_send_at");});
 it("does not reschedule already materialized invitations",async()=>{current.invitation_materialized_at="2030-10-14T16:01:00Z";expect((await put({timingRules:{...rules,invitationRule:"start-7d"}})).status).toBe(200);expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("reminder_send_ats");});
});
