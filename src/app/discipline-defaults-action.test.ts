import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({access:vi.fn(),rpc:vi.fn(),redirect:vi.fn((url:string) => {throw new Error(url);}),definition:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/activity-settings-access", () => ({activitySettingsAccess:mocks.access}));
vi.mock("@/lib/activity-configuration", async (importOriginal) => ({...await importOriginal<typeof import("@/lib/activity-configuration")>(),loadDefaultsDefinition:mocks.definition}));
vi.mock("next/navigation", () => ({redirect:mocks.redirect,unstable_rethrow:vi.fn()}));
vi.mock("next/cache", () => ({revalidatePath:mocks.revalidate}));
import { saveDisciplineDefaults } from "./activity-settings-actions";
function form(values: unknown) {
  const data = new FormData();
  for (const [key,value] of Object.entries({organizationSlug:"club",scope:"team",scopeId:"10000000-0000-0000-0000-000000000001",activityTypeId:"20000000-0000-0000-0000-000000000002",revision:"3",disciplineId:"football-id",version:"1.0.0",values:JSON.stringify(values)})) data.set(key,value);
  return data;
}
beforeEach(() => {vi.clearAllMocks();mocks.access.mockResolvedValue({supabase:{rpc:mocks.rpc},organization:{id:"club-id"}});mocks.rpc.mockResolvedValue({error:null});mocks.definition.mockResolvedValue({activityTypeId:"match",organizationId:"club-id",sectionId:"section",teamId:"team",disciplineId:"football-id",disciplineKey:"football",activityTypeSlug:"match-tavling",activityCategory:"competition"});});
it("writes selected internal values and option lists atomically to the authorized target", async () => {
  const patch={invitationRule:"start-6d",reminderRules:[],options:{invitationRule:["start-6d","start-1d"],reminderRules:null}};
  await expect(saveDisciplineDefaults(form(patch))).rejects.toThrow("saved=1");
  expect(mocks.access).toHaveBeenCalledWith("club","team","10000000-0000-0000-0000-000000000001");
  expect(mocks.rpc).toHaveBeenCalledWith("save_discipline_defaults",expect.objectContaining({target_organization_id:"club-id",expected_revision:3,patch}));
});
it("rejects tampered option lists before writing", async () => {
  await expect(saveDisciplineDefaults(form({options:{reminderRules:["start-1d"]}}))).rejects.toThrow("error=");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("preserves revision conflict handling for lists and defaults", async () => {
  mocks.rpc.mockResolvedValue({error:{code:"40001"}});
  await expect(saveDisciplineDefaults(form({options:{duration:["PT60M"]}}))).rejects.toThrow("error=");
  expect(mocks.redirect.mock.calls[0][0]).toContain("Ladda+om+sidan");
});
it("does not write when target authorization fails", async () => {
  mocks.access.mockRejectedValue(new Error("Forbidden"));
  await expect(saveDisciplineDefaults(form({options:{duration:["PT60M"]}}))).rejects.toThrow("error=Forbidden");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects stale discipline and profile version before writing", async () => {
 for(const [field,value] of [["disciplineId","other"],["version","2.0.0"]]) {
  const data=form({});data.set(field,value);
  await expect(saveDisciplineDefaults(data)).rejects.toThrow("error=");
 }
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects removed club and system defaults scopes", async () => {
 for(const scope of ["organization","system"]) {
  const data=form({});data.set("scope",scope);
  await expect(saveDisciplineDefaults(data)).rejects.toThrow("Ogiltig nivå");
 }
 expect(mocks.rpc).not.toHaveBeenCalled();
});
