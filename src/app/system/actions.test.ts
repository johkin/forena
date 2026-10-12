import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), revalidate: vi.fn(), redirect: vi.fn((url: string) => { throw new Error(url); }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { updateDiscipline, deleteDiscipline, updateSystemMemory, deleteSystemMemory, cancelSystemAdminInvite, createDisciplineCategory, updateDisciplineCategory, deleteDisciplineCategory } from "./actions";

describe("system mutation results", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([updateDiscipline, updateSystemMemory, deleteSystemMemory, cancelSystemAdminInvite])("does not report success for zero rows", async action => {
    const query = { update: vi.fn(), delete: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn().mockResolvedValue({ data: { key: "floorball" }, error: null }), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    for (const method of [query.update, query.delete, query.eq, query.select]) method.mockReturnValue(query);
    mocks.client.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user" } } }) },
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }), from: vi.fn(() => query) });
    const form = new FormData();
    for (const [key, value] of Object.entries({ id: "id", content: "Content", name: "Name" })) form.set(key, value);
    await expect(action(form)).rejects.toThrow("error=");
    expect(query.select).toHaveBeenCalledWith("id");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});


describe("code-owned discipline metadata", () => {
  it("rejects changes to football after checking system administrator access", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), single: vi.fn().mockResolvedValue({ data: { key: "football" }, error: null }), update: vi.fn() };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    mocks.client.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user" } } }) }, rpc, from: vi.fn(() => query) });
    const form = new FormData(); form.set("id", "football-id"); form.set("name", "Changed");
    await expect(updateDiscipline(form)).rejects.toThrow("versionshanteras");
    expect(rpc).toHaveBeenCalledWith("has_platform_role", { allowed_roles: ["system_admin"] });
    expect(query.update).not.toHaveBeenCalled();
  });
});

describe("unused discipline deletion", () => {
  it.each([{ code: "55000", message: "Discipline is in use" }, null])("does not report success when the database blocks deletion or returns zero rows", async error => {
    const query = { select: vi.fn(), eq: vi.fn(), delete: vi.fn(), single: vi.fn().mockResolvedValue({ data: { key: "floorball" }, error: null }), maybeSingle: vi.fn().mockResolvedValue({ data: null, error }) };
    for (const method of [query.select, query.eq, query.delete]) method.mockReturnValue(query);
    mocks.client.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user" } } }) }, rpc: vi.fn().mockResolvedValue({ data: true, error: null }), from: vi.fn(() => query) });
    const form = new FormData(); form.set("id", "10000000-0000-0000-0000-000000000001");
    mocks.revalidate.mockClear();
    await expect(deleteDiscipline(form)).rejects.toThrow("error=");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("requires the platform role before reading or deleting", async () => {
    const from = vi.fn();
    mocks.client.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user" } } }) }, rpc: vi.fn().mockResolvedValue({ data: false, error: null }), from });
    const form = new FormData(); form.set("id", "10000000-0000-0000-0000-000000000001");
    await expect(deleteDiscipline(form)).rejects.toThrow("/");
    expect(from).not.toHaveBeenCalled();
  });
});

describe("discipline categories", () => {
 it.each([createDisciplineCategory,updateDisciplineCategory,deleteDisciplineCategory])("requires the system role before touching the catalogue",async action=>{
  const from=vi.fn();mocks.client.mockResolvedValue({auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:"user"}}})},rpc:vi.fn().mockResolvedValue({data:false,error:null}),from});
  await expect(action(new FormData())).rejects.toThrow("/");expect(from).not.toHaveBeenCalled();
 });
 it("explains why an in-use category cannot be deleted",async()=>{
  const query={delete:vi.fn(),eq:vi.fn(),select:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data:null,error:{code:"23503"}})};
  for(const method of [query.delete,query.eq,query.select])method.mockReturnValue(query);
  mocks.client.mockResolvedValue({auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:"user"}}})},rpc:vi.fn().mockResolvedValue({data:true,error:null}),from:vi.fn(()=>query)});
  const form=new FormData();form.set("key","sport");mocks.revalidate.mockClear();
  await expect(deleteDisciplineCategory(form)).rejects.toThrow(encodeURIComponent("Kategorin används av discipliner och kan inte tas bort."));expect(mocks.revalidate).not.toHaveBeenCalled();
 });
});
