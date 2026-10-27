import { expect,it } from "vitest";
import { confirmedAnswer, overviewItems, type Overview } from "./personal-overview";
const data:Overview={calendar_people:[],calendar_teams:[],reference_time:"2029-12-01T00:00:00Z",organizations:[],teams:[],activities:[{
 id:"a",can_manage_activities:false,can_manage_attendance:false,title:"Träning",starts_at:"2030-01-01T10:00:00Z",ends_at:"2030-01-01T12:00:00Z",gathering_at:null,response_due_at:null,location:"Örvallen",description:"",status:"scheduled",
 organization:{id:"o",name:"Klubb",time_zone:"Europe/Stockholm",role:null},team:{id:"t",name:"F2016",organization_id:"o",roles:[]},
 people:[{id:"p1",attendance:"unknown",name:"Johan",invitation:{id:"i1",person_id:"p1",name:"Johan",response:"pending",response_comment:null}},
 {id:"p2",attendance:"unknown",name:"Tilda",invitation:{id:"i2",person_id:"p2",name:"Tilda",response:"declined",response_comment:"Hämtas senare"}},
 {id:"p3",attendance:"unknown",name:"Robin",invitation:null}]
}]};
it("keeps named person rows independent of invitations and preserves club-local metadata",()=>{
 const rows=overviewItems(data.activities);
 expect(rows).toHaveLength(3);expect(rows[2].member.displayName).toBe("Robin");expect(rows[2].invitation).toBeUndefined();
 expect(rows[0].organization?.timeZone).toBe("Europe/Stockholm");expect(rows[0].activity.location).toBe("Örvallen");
});
it("updates only the server-confirmed person's answer, retaining comments and unrelated people",()=>{
 const updated=confirmedAnswer(data,"i2","accepted");
 expect(updated.activities[0].people[1].invitation?.response).toBe("accepted");
 expect(updated.activities[0].people[1].invitation?.response_comment).toBe("Hämtas senare");
 expect(updated.activities[0].people[0].invitation?.response).toBe("pending");
 expect(data.activities[0].people[1].invitation?.response).toBe("declined");
});

it("keeps a managed activity visible without inventing a participant or response right",()=>{
 const rows=overviewItems([{...data.activities[0],people:[]}]);
 expect(rows).toHaveLength(1);
 expect(rows[0].activityOnly).toBe(true);
 expect(rows[0].invitation).toBeUndefined();
 expect(rows[0].member.displayName).toBe("");
});

it("uses verified activity permission rather than leader labels for the deadline exception", () => {
 const activity = data.activities[0];
 expect(overviewItems([{...activity,team:{...activity.team,roles:["leader"]},can_manage_activities:false}])[0].canManageActivity).toBe(false);
 expect(overviewItems([{...activity,can_manage_activities:true}])[0].canManageActivity).toBe(true);
});
