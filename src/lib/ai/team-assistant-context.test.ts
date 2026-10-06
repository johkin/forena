import { describe, expect, it, vi } from "vitest";
import { loadTeamAssistantContext } from "./team-assistant-context";
import type { AssistantDependencies } from "./team-assistant-types";

function setup({ leader = false, family = true, team = true, invitationManager = false } = {}) {
  const queries: { table: string; select: ReturnType<typeof vi.fn>; in: ReturnType<typeof vi.fn>; or: ReturnType<typeof vi.fn> }[] = [];
  const from = vi.fn((table: string) => {
    const data = {
      teams: team ? { id: "team", organization_id: "org", section_id: "section", discipline_id: null, name: "Laget" } : null,
      people: family ? [{ id: "own-person", display_name: "Barn" }] : [],
      person_guardians: [],
      memberships: family ? [{ person_id: "own-person" }] : [],
      organizations: { name: "Klubb", assistant_name: "Nova", time_zone: "Europe/Stockholm", discipline_id: null },
      sections: { discipline_id: null },
      activities: [{ id: "activity", activity_type_id: "training", title: "Träning", description_markdown: "Info",
        gathering_at: null, starts_at: "2026-10-20T16:00:00Z", ends_at: "2026-10-20T17:30:00Z", location: "Plan" }],
      invitations: [], activity_type_documents: [], team_tasks: [], assistant_memories: [],
    }[table];
    const result = { data, error: null };
    const builder = {
      select: vi.fn(), eq: vi.fn(), in: vi.fn(), is: vi.fn(), neq: vi.fn(), gte: vi.fn(), or: vi.fn(), order: vi.fn(), limit: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue(result), single: vi.fn().mockResolvedValue(result),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    for (const method of [builder.select, builder.eq, builder.in, builder.is, builder.neq, builder.gte, builder.or, builder.order, builder.limit]) method.mockReturnValue(builder);
    queries.push({ table, select: builder.select, in: builder.in, or: builder.or });
    return builder;
  });
  const rpc = vi.fn((_name: string, { target_permission }: { target_permission: string }) => Promise.resolve({
    data: target_permission === "team.view" ? leader : target_permission === "invitation.manage" ? invitationManager : false,
    error: null,
  }));
  const dependencies: AssistantDependencies = { supabase: { from, rpc } as unknown as AssistantDependencies["supabase"], userId: "user" };
  return { dependencies, from, queries };
}

const input = { teamId: "team", question: "Hej", messages: [] };

describe("team assistant context access", () => {
  it("rejects missing teams before fetching any personal context", async () => {
    const { dependencies, from } = setup({ team: false });
    await expect(loadTeamAssistantContext(input, dependencies)).rejects.toMatchObject({ code: "team-not-found" });
    expect(from.mock.calls.map(([table]) => table)).toEqual(["teams"]);
  });

  it("rejects users without team permission or an active family membership", async () => {
    const { dependencies, from } = setup({ family: false });
    await expect(loadTeamAssistantContext(input, dependencies)).rejects.toMatchObject({ code: "team-forbidden" });
    expect(from).not.toHaveBeenCalledWith("activities");
    expect(from).not.toHaveBeenCalledWith("invitations");
  });

  it("restricts family invitations to personal ids and selects the family persona", async () => {
    const { dependencies, queries } = setup();
    const result = await loadTeamAssistantContext(input, dependencies);
    expect(result.context.viewer.kind).toBe("player-or-guardian");
    expect(result.context.activities[0].teamResponseSummary).toBeUndefined();
    const invitations = queries.filter(query => query.table === "invitations");
    expect(invitations).toHaveLength(1);
    expect(invitations[0].in).toHaveBeenCalledWith("person_id", ["own-person"]);
  });


  it("scopes personal memories to the current organization", async () => {
    const { dependencies, queries } = setup();
    await loadTeamAssistantContext(input, dependencies);
    const memoryQuery = queries.find((query) => query.table === "assistant_memories");
    expect(memoryQuery).toBeDefined();
    expect(memoryQuery?.or).toHaveBeenCalledWith(expect.stringContaining("and(scope.eq.personal,scope_id.eq.user,organization_id.eq.org)"));
  });

  it("selects leader tone without granting invitation permissions", async () => {
    const { dependencies, queries } = setup({ leader: true, family: false });
    const result = await loadTeamAssistantContext(input, dependencies);
    expect(result.context.viewer.kind).toBe("leader");
    expect(result.context.teamId).toBe("team");
    expect(result.context.team).toBe("Laget");
    expect(result.canManageActivities).toBe(false);
    expect(queries.filter(query => query.table === "invitations")).toHaveLength(0);
    expect(result.context.activities[0].teamResponseSummary).toBeUndefined();
  });

  it("includes team response summaries only for invitation managers", async () => {
    const { dependencies, queries } = setup({ leader: true, invitationManager: true, family: false });
    const result = await loadTeamAssistantContext(input, dependencies);
    expect(result.context.activities[0].teamResponseSummary).toBeDefined();
    expect(queries.filter(query => query.table === "invitations")).toHaveLength(1);
  });
});
