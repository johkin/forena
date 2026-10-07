import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), revalidate: vi.fn(), redirect: vi.fn((url: string) => { throw new Error(url); }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { updateDiscipline, updateSystemMemory, deleteSystemMemory, cancelSystemAdminInvite } from "./actions";

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
