import { renderToStaticMarkup } from "react-dom/server";
import { expect,it } from "vitest";
import { PersonalHome } from "./personal-home";
import type { OverviewItem } from "./personal-overview-types";
import type { Activity } from "../domain/club";

it("counts activities across the complete dataset, with two people in both pending and upcoming",()=>{
 const activities:Activity[]=Array.from({length:55},(_,index)=>({id:`a${index}`,organizationId:"o",teamId:"t",title:`Aktivitet ${index}`,startsAt:"2030-01-01T10:00:00Z",endsAt:"2030-01-01T12:00:00Z",location:"Örvallen"}));
 const items:OverviewItem[]=activities.flatMap(activity=>["Johan","Tilda"].map((name,index)=>({activity,organization:{name:"Klubb",timeZone:"Europe/Stockholm"},team:{name:"F2016"},member:{id:name,displayName:name},invitation:activity.id==="a54"?{id:`i${index}`,response:"pending" as const}:undefined})));
 const html=renderToStaticMarkup(<PersonalHome items={items} activities={activities} organizations={[]} teams={[]} referenceTime="2029-12-01T00:00:00Z" onOpenActivity={()=>{}} />);
 expect(html).toContain('id="pending-activities-title">Behöver svar');
 expect(html).toContain('class="badge">1</span>');
 expect(html).toContain('class="badge">55</span>');
 expect(html.match(/class="personal-activity-row"/g)).toHaveLength(56);
 expect(html.match(/class="personal-activity-person"/g)).toHaveLength(112);
 expect(html).toContain("Ingen kallelse ännu");
 expect(html).toContain("Agenda");expect(html).toContain("Kalender");
});
