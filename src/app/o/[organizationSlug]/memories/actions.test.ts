import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), revalidate: vi.fn(), redirect: vi.fn((url: string) => { throw new Error(url); }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { deleteMemory, updateMemory } from "./actions";

function setup(result: { data: { id: string } | null; error: { message: string } | null }) {
  const eq = vi.fn();
  const query = { update: vi.fn(), delete: vi.fn(), eq, select: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(result) };
  for (const method of [query.update, query.delete, query.eq, query.select]) method.mockReturnValue(query);
  const organization = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: "org" }, error: null }) };
  organization.select.mockReturnValue(organization); organization.eq.mockReturnValue(organization);
  mocks.client.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user" } } }) },
    from: vi.fn((table: string) => table === "organizations" ? organization : query) });
  const form = new FormData();
  for (const [name, value] of Object.entries({ organizationSlug: "club", scope: "team", scopeId: "team", id: "memory", content: "Updated" })) form.set(name, value);
  return { form, query, eq };
}

describe("memory mutations", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([updateMemory, deleteMemory])("rejects a zero-row mutation", async action => {
    const { form, query } = setup({ data: null, error: null });
    await expect(action(form)).rejects.toThrow("error=");
    expect(query.select).toHaveBeenCalledWith("id");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each([updateMemory, deleteMemory])("preserves database error handling", async action => {
    const { form } = setup({ data: null, error: { message: "denied" } });
    await expect(action(form)).rejects.toThrow("error=");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each([updateMemory, deleteMemory])("binds a successful mutation to organization and scope", async action => {
    const { form, eq } = setup({ data: { id: "memory" }, error: null });
    await expect(action(form)).rejects.toThrow(/saved=1|deleted=1/);
    expect(eq).toHaveBeenCalledWith("organization_id", "org");
    expect(eq).toHaveBeenCalledWith("scope", "team");
    expect(eq).toHaveBeenCalledWith("scope_id", "team");
    expect(mocks.revalidate).toHaveBeenCalledWith("/o/club/memories");
  });
});
