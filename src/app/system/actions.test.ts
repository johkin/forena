import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), revalidate: vi.fn(), redirect: vi.fn((url: string) => { throw new Error(url); }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { updateDiscipline, updateSystemMemory, deleteSystemMemory, cancelSystemAdminInvite } from "./actions";

describe("system mutation results", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([updateDiscipline, updateSystemMemory, deleteSystemMemory, cancelSystemAdminInvite])("does not report success for zero rows", async action => {
    const query = { update: vi.fn(), delete: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
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
