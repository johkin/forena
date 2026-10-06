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
