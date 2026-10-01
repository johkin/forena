import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/site-url", () => ({ getSiteUrl: vi.fn() }));
import { updateMemberName } from "./actions";

function query(data: unknown) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
    update: vi.fn(),
    maybeSingle: vi.fn(),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data, error: null }).then(resolve),
  };
  for (const method of [
    builder.select,
    builder.eq,
    builder.in,
    builder.is,
    builder.update,
  ])
    method.mockReturnValue(builder);
  builder.maybeSingle.mockResolvedValue({ data, error: null });
  return builder;
}
function setup({ user = true, allowed = true, member = true } = {}) {
  const people = query({ id: "person-a" });
  const membership = query(member ? [{ id: "membership-a" }] : []);
  const client = {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: user ? { id: "user-a" } : null } }),
    },
    rpc: vi.fn().mockResolvedValue({ data: allowed }),
    from: vi.fn(
      (table: string) =>
        ({
          organizations: query({ id: "org-a" }),
          teams: query({ id: "team-a", organization_id: "org-a" }),
          memberships: membership,
          people,
        })[table],
    ),
  };
  mocks.client.mockResolvedValue(client);
  const form = new FormData();
  form.set("organizationSlug", "club");
  form.set("teamSlug", "team");
  form.set("personId", "person-a");
  form.set("displayName", "Alex Andersson");
  return { client, people, membership, form };
}

beforeEach(() => vi.clearAllMocks());
describe("member name updates", () => {
  it("requires authentication before accessing team data", async () => {
    const { client, people, form } = setup({ user: false });
    await expect(updateMemberName(form)).rejects.toThrow("redirect:/login");
    expect(client.from).not.toHaveBeenCalled();
    expect(people.update).not.toHaveBeenCalled();
  });
  it("requires roster.manage before looking up or changing the person", async () => {
    const { client, people, form } = setup({ allowed: false });
    await expect(updateMemberName(form)).rejects.toThrow("redirect:");
    expect(client.rpc).toHaveBeenCalledWith("has_team_permission", {
      target_team_id: "team-a",
      target_permission: "roster.manage",
    });
    expect(client.from).not.toHaveBeenCalledWith("people");
    expect(people.update).not.toHaveBeenCalled();
  });
  it("rejects a person outside the current active team", async () => {
    const { people, membership, form } = setup({ member: false });
    await expect(updateMemberName(form)).rejects.toThrow("redirect:");
    expect(membership.eq).toHaveBeenCalledWith("team_id", "team-a");
    expect(membership.is).toHaveBeenCalledWith("ends_on", null);
    expect(people.update).not.toHaveBeenCalled();
  });
  it("scopes the write to the organization and returns to the member profile", async () => {
    const { people, form } = setup();
    await expect(updateMemberName(form)).rejects.toThrow(
      "?person=person-a&saved=Alex%20Andersson",
    );
    expect(people.eq).toHaveBeenCalledWith("id", "person-a");
    expect(people.eq).toHaveBeenCalledWith("organization_id", "org-a");
    expect(people.update).toHaveBeenCalledWith({
      display_name: "Alex Andersson",
    });
  });
});
