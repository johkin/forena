import { expect, it } from "vitest";
import { clubSlug, parseClubSetup, clubStructureSchema } from "./club-administration";
function form(extra: Record<string,string> = {}) {
  const f = new FormData();
  for (const [k,v] of Object.entries({ organizationName:"  Åre IK ",organizationSlug:"are-ik",sectionName:"Innebandy",disciplineId:"10000000-0000-0000-0000-000000000001",timeZone:"Europe/Stockholm",...extra })) f.set(k,v);
  return f;
}
it("creates a first section without requiring a team or copying hidden team data", () => {
  const value = parseClubSetup(form({teamName:"Stale",season:"2026"}));
  expect(value).toEqual({organizationName:"Åre IK",organizationSlug:"are-ik",sectionName:"Innebandy",sectionSlug:"innebandy",disciplineId:"10000000-0000-0000-0000-000000000001",timeZone:"Europe/Stockholm"});
});
it("includes an explicitly selected optional team and Swedish slug", () => {
  expect(parseClubSetup(form({addTeam:"on",teamName:"Flickor 2016",season:"2026/2027"}))).toMatchObject({teamName:"Flickor 2016",teamSlug:"flickor-2016",season:"2026/2027"});
  expect(clubSlug(" Åre & Östersund ")).toBe("are-ostersund");
});
it.each([{organizationSlug:"../admin"},{disciplineId:"bad"},{sectionName:"💚"},{timeZone:"Mars/Stockholm"},{addTeam:"on",teamName:""}] as Record<string,string>[])("rejects invalid setup values %j", invalid => { expect(()=>parseClubSetup(form(invalid))).toThrow(); });
it("accepts persisted GUIDs and validates the administration response shape", () => {
  expect(clubStructureSchema.parse({organization:{id:"10000000-0000-0000-0000-000000000001",slug:"are-ik",name:"Åre IK",assistantName:"Assistent",timeZone:"Europe/Stockholm"},sections:[]})).toBeDefined();
  expect(()=>clubStructureSchema.parse({organization:{},sections:[]})).toThrow();
});
