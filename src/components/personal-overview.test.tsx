import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PersonalOverview } from "./personal-overview";
import type { FamilyActivity } from "@/domain/club";
it.each(["accepted","declined","pending"] as const)("keeps duty and %s status visible in the collapsible overview",response=>{
  const item={member:{id:"child",displayName:"Test"},team:{name:"Team"},activity:{id:"a",title:"Work",startsAt:"2030-01-01T10:00:00Z",location:"Cafe"},hasDutyAssignment:true,invitation:{response}} as FamilyActivity;
  const html=renderToStaticMarkup(createElement(PersonalOverview,{activities:[item],timeZone:"Europe/Stockholm",onOpenActivity:()=>{}}));
  expect(html).toContain("Bokad arbetsuppgift · "+({accepted:"Kommer",declined:"Kan inte",pending:"Ej svarat"}[response]));
  expect(html).toContain('class="overview-details"');
  expect(html).not.toContain("Spara kommentar");
});

it("groups leader and children under one activity with separate response statuses", () => {
  const base = { team: { name: "F2016" }, activity: { id: "a", title: "Träning", startsAt: "2030-01-01T10:00:00Z", location: "Pitch" } };
  const activities = [
    { ...base, member: { id: "leader", displayName: "Johan" }, invitation: { response: "accepted" } },
    { ...base, member: { id: "child", displayName: "Tilda" }, invitation: { response: "pending" } },
  ] as FamilyActivity[];
  const html = renderToStaticMarkup(createElement(PersonalOverview, { activities, timeZone: "Europe/Stockholm", onOpenActivity: () => {} }));
  expect(html.match(/class="personal-activity-row"/g)).toHaveLength(1);
  expect(html.match(/<button/g)).toHaveLength(1);
  expect(html).toContain('class="badge">1</span>');
  expect(html).toContain("Johan</span><span>Kommer");
  expect(html).toContain("Tilda</span><span>Ej svarat");
});
it("keeps different activities with the same title separate and avoids repeating a person", () => {
  const item = { member: { id: "child", displayName: "Tilda" }, team: { name: "F2016" }, activity: { id: "a", title: "Träning", startsAt: "2030-01-01T10:00:00Z", location: "Pitch" }, invitation: { response: "declined" } } as FamilyActivity;
  const html = renderToStaticMarkup(createElement(PersonalOverview, { activities: [item, item, { ...item, activity: { ...item.activity, id: "b" } }], timeZone: "Europe/Stockholm", onOpenActivity: () => {} }));
  expect(html.match(/class="personal-activity-row"/g)).toHaveLength(2);
  expect(html.match(/class="personal-activity-person"/g)).toHaveLength(2);
  expect(html).toContain('class="badge">2</span>');
});
it("opens the grouped activity on click", () => {
  const item = { member: { id: "child", displayName: "Tilda" }, team: { name: "F2016" }, activity: { id: "a", title: "Träning", startsAt: "2030-01-01T10:00:00Z", location: "Pitch" } } as FamilyActivity;
  let opened: FamilyActivity | undefined;
  const tree = PersonalOverview({ activities: [item], timeZone: "Europe/Stockholm", onOpenActivity: value => { opened = value; } });
  const rows = tree.props.children.props.children[1].props.children;
  rows[0].props.children.props.onClick();
  expect(opened?.activity.id).toBe("a");
});
