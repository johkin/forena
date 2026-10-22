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

it("uses the same unambiguous short names in both sections, counting each person once",()=>{
 const activity:Activity={id:"a",organizationId:"o",teamId:"t",title:"Träning",startsAt:"2030-01-01T10:00:00Z",endsAt:"2030-01-01T12:00:00Z",location:"Örvallen"};
 const items:OverviewItem[]=["Johan Kindgren","Johan Karlsson","Johan Svensson","Tilda Kindgren"].map((displayName,index)=>({activity,team:{name:"Lag"},member:{id:`p${index}`,displayName},invitation:index===0?{id:"i",response:"pending"}:undefined}));
 // Another activity's person must also participate in disambiguation, even
 // when their activity has no pending invitation and is absent from that section.
 items[1]={...items[1],activity:{...activity,id:"b"}};
 items.push({...items[3],activity:{...activity,id:"b"}});
 const html=renderToStaticMarkup(<PersonalHome items={items} activities={[activity,{...activity,id:"b"}]} organizations={[]} teams={[]} referenceTime="2029-12-01T00:00:00Z" onOpenActivity={()=>{}} />);
 expect(html.match(/>Johan Kindgren<\/strong>/g)).toHaveLength(2);
 expect(html).toContain('title="Johan Svensson"><span aria-hidden="true">Johan S</span><span class="sr-only">Johan Svensson</span></strong>');
 expect(html).toContain('title="Tilda Kindgren"><span aria-hidden="true">Tilda</span><span class="sr-only">Tilda Kindgren</span></strong>');
 expect(html).toContain('aria-label="Kommer: Johan Kindgren"');
 expect(html).not.toContain('>Tilda K</strong>');
});
