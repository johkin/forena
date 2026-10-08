import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DisciplineDefaultsFields } from "./discipline-defaults-fields";
import { resolveDisciplineDefaults } from "@/lib/discipline-defaults";
const context={activityTypeId:"match",organizationId:"club",sectionId:"section",teamId:"team",disciplineId:"football",disciplineKey:"football",activityTypeSlug:"match-tavling",activityCategory:"competition"};
it("offers separate inherited activation and checkpoint settings on football matches",()=>{
 const html=renderToStaticMarkup(<DisciplineDefaultsFields initial={{}} resolved={resolveDisciplineDefaults(context,[])}/>);
 expect(html).toContain("notifiering vid spelarbrist");
 expect(html).toContain("Ärv · Av");
 expect(html).toContain("Ärv kontrolltider");
 expect(html).toContain("3 dagar, 1 dag");
 expect(html).not.toContain("Egen kontrolltid i timmar");
});
it("shows chosen checkpoints and serializes explicit off and no checks",()=>{
 const patch={capabilities:{targetTeamSize:{notificationsEnabled:false,notificationHours:[]}}};
 const html=renderToStaticMarkup(<DisciplineDefaultsFields initial={patch} resolved={resolveDisciplineDefaults(context,[])}/>);
 expect(html).toContain('value="false" selected=""');
 expect(html).toContain("Inga kontrolltider valda");
 expect(html).toContain("Egen kontrolltid i timmar");
 expect(html).toContain('&quot;notificationsEnabled&quot;:false');
 expect(html).toContain('&quot;notificationHours&quot;:[]');
});
it("does not offer match-shortage controls for swimming or training",()=>{
 for(const override of [{disciplineKey:"swimming"},{activityTypeSlug:"traning"}]) {
  const html=renderToStaticMarkup(<DisciplineDefaultsFields initial={{}} resolved={resolveDisciplineDefaults({...context,...override},[])}/>);
  expect(html).not.toContain("notifiering vid spelarbrist");
 }
});
