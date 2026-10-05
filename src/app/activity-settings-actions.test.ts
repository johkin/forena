import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(), rethrow: vi.fn(), redirect: vi.fn((url: string) => { throw new Error(url); }) }));
vi.mock("@/lib/activity-settings-access", () => ({ activitySettingsAccess: mocks.access }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, unstable_rethrow: mocks.rethrow }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { saveTargetDiscipline } from "./activity-settings-actions";
function form() { const f = new FormData(); for (const [k,v] of Object.entries({ organizationSlug:"club", scope:"team", scopeId:"e3000000-0000-0000-0000-000000000001", discipline_id:"e4000000-0000-0000-0000-000000000001" })) f.set(k,v); return f; }
beforeEach(() => { vi.clearAllMocks(); mocks.access.mockResolvedValue({ supabase:{ rpc:mocks.rpc }, organization:{ id:"org" } }); mocks.rpc.mockResolvedValue({ error:null }); mocks.rethrow.mockImplementation(() => {}); });
describe("discipline action status", () => {
  it.each([["organizationSlug","../invalid"],["scope","unknown"]])("handles invalid %s with a safe redirect",async (key,value)=>{const f=form();f.set(key,value);await expect(saveTargetDiscipline(f)).rejects.toThrow("/?error=");expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.access).not.toHaveBeenCalled();});
  it("saves an authorized discipline and redirects with success", async () => { await expect(saveTargetDiscipline(form())).rejects.toThrow("saved=1"); expect(mocks.rpc).toHaveBeenCalledWith("set_activity_discipline", expect.objectContaining({ target_organization_id:"org" })); });
  it("reports invalid discipline IDs without writing", async () => { const f=form(); f.set("discipline_id","invalid"); await expect(saveTargetDiscipline(f)).rejects.toThrow("error="); expect(mocks.rpc).not.toHaveBeenCalled(); });
  it("reports changed access instead of throwing outside the status flow", async () => { mocks.access.mockRejectedValue(new Error("Access denied")); await expect(saveTargetDiscipline(form())).rejects.toThrow("error=Access+denied"); expect(mocks.rpc).not.toHaveBeenCalled(); });
  it("rejects system scope without dereferencing a missing organization", async () => { const f=form(); f.set("scope","system"); f.set("organizationSlug",""); mocks.access.mockResolvedValue({ supabase:{ rpc:mocks.rpc }, organization:null }); await expect(saveTargetDiscipline(f)).rejects.toThrow("error="); expect(mocks.rpc).not.toHaveBeenCalled(); });
  it("reports RPC failures without showing a success status", async () => { mocks.rpc.mockResolvedValue({ error:{ message:"Internal error" } }); await expect(saveTargetDiscipline(form())).rejects.toThrow("error="); expect(mocks.redirect.mock.calls[0][0]).not.toContain("saved="); });
  it("preserves framework login redirects", async () => { const login=new Error("NEXT_REDIRECT"); mocks.access.mockRejectedValue(login); mocks.rethrow.mockImplementation(error => { if(error===login) throw error; }); await expect(saveTargetDiscipline(form())).rejects.toBe(login); expect(mocks.redirect).not.toHaveBeenCalled(); });
});
