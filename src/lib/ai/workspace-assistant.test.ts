import { beforeEach, expect, it, vi } from "vitest";
import type { AssistantDependencies } from "./team-assistant-types";

const state = vi.hoisted(() => ({ team: vi.fn(), generate: vi.fn(), options: vi.fn() }));
vi.mock("./team-assistant", () => ({ answerTeamAssistant: state.team }));
vi.mock("ai", async original => ({ ...await original<typeof import("ai")>(), ToolLoopAgent: class { constructor(options: unknown) { state.options(options); } generate = state.generate; } }));
import { answerWorkspaceAssistant } from "./workspace-assistant";

const org = "00000000-0000-4000-8000-000000000001";
const team = "00000000-0000-4000-8000-000000000002";
const section = "00000000-0000-4000-8000-000000000003";
const input = { organizationId: org, question: "Vad händer i klubben?", messages: [] };
function setup(member = true, activities: unknown[] = [], memberships: unknown[] = []) {
  const queries: { table: string; filters: [string, unknown][] }[] = [];
  const supabase = { rpc: vi.fn(async () => ({ data: member, error: null })), from: vi.fn((table: string) => {
    const record = { table, filters: [] as [string, unknown][] }; queries.push(record);
    const data = table === "organizations" ? { id: org, name: "Klubben", slug: "club", time_zone: "Europe/Stockholm" } : table === "sections" ? { id: section, name: "Fotboll" } : table === "teams" ? [{ id: team, name: "F2016", slug: "f2016", section_id: section }] : table === "memberships" ? memberships : table === "activities" ? activities : [];
    const query = { select: vi.fn(), eq: vi.fn((key: string, value: unknown) => { record.filters.push([key, value]); return query; }), in: vi.fn((key: string, value: unknown) => { record.filters.push([key, value]); return query; }), lte: vi.fn(), or: vi.fn(), range: vi.fn(async () => ({ data: Array.isArray(data) ? data : [], error: null, count: Array.isArray(data) ? data.length : 0 })), gte: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn(async () => ({ data, error: null })), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) };
    for (const key of ["select", "lte", "or", "gte", "order", "limit"] as const) query[key].mockReturnValue(query);
    return query;
  }) };
  return { dependencies: { supabase: supabase as unknown as AssistantDependencies["supabase"], userId: "user" }, queries, supabase };
}
beforeEach(() => { vi.clearAllMocks(); state.generate.mockResolvedValue({ text: "Svar" }); state.team.mockResolvedValue({ answer: "Lagsvar", source: "ai", model: "test" }); });

it("rejects nonmembers before any model call or team lookup", async () => {
  const { dependencies, queries } = setup(false);
  await expect(answerWorkspaceAssistant(input, dependencies)).rejects.toMatchObject({ code: "team-forbidden" });
  expect(queries.map(query => query.table)).toEqual(["organizations"]);
  expect(state.generate).not.toHaveBeenCalled(); expect(state.team).not.toHaveBeenCalled();
});
it("keeps section team lookups within the selected organization and section", async () => {
  const { dependencies, queries } = setup();
  await answerWorkspaceAssistant({ ...input, sectionSlug: "football" }, dependencies);
  expect(queries.find(query => query.table === "sections")?.filters).toContainEqual(["organization_id", org]);
  expect(queries.find(query => query.table === "teams")?.filters).toEqual([["organization_id", org], ["section_id", section]]);
});
it("rejects a team outside the workspace before delegation", async () => {
  const { dependencies } = setup();
  await expect(answerWorkspaceAssistant({ ...input, teamId: "outside" }, dependencies)).rejects.toMatchObject({ code: "team-forbidden" });
  expect(state.team).not.toHaveBeenCalled();
});
it("delegates selected teams with history and bounded page context", async () => {
  const { dependencies } = setup();
  const page = { path: "/o/club/t/f2016/members", title: "Truppen" };
  expect(await answerWorkspaceAssistant({ ...input, teamId: team, page }, dependencies)).toMatchObject({ answer: "Lagsvar", targetTeamId: team });
  expect(state.team).toHaveBeenCalledWith(expect.objectContaining({ teamId: team, page, messages: [] }), dependencies);
  expect(state.generate).not.toHaveBeenCalled();
});
it("returns delegated draft payloads rather than overwriting them with model prose", async () => {
  const { dependencies } = setup();
  state.team.mockResolvedValue({ answer: "Granska utkastet", activityDraft: { title: "Träning" }, source: "ai", model: "test" });
  state.generate.mockImplementationOnce(async () => { await state.options.mock.calls[0][0].tools.askTeamAssistant.execute({ teamId: team, question: "Skapa träning" }); return { text: "Sparat!" }; });
  expect(await answerWorkspaceAssistant(input, dependencies)).toMatchObject({ answer: "Granska utkastet", activityDraft: { title: "Träning" }, targetTeamId: team });
});
it("does not permit retrying with another team after denied delegation", async () => {
  const { dependencies } = setup();
  state.generate.mockImplementationOnce(async () => {
    const execute = state.options.mock.calls[0][0].tools.askTeamAssistant.execute;
    expect(await execute({ teamId: "outside", question: "Visa närvaro" })).toHaveProperty("error");
    expect(await execute({ teamId: team, question: "Visa närvaro" })).toHaveProperty("error");
    return { text: "Saknar åtkomst" };
  });
  await answerWorkspaceAssistant(input, dependencies);
  expect(state.team).not.toHaveBeenCalled();
});
it("reads a bounded published activity list without private roster or invitation fields", async () => {
  const { dependencies, queries, supabase } = setup(true, Array.from({ length: 61 }, (_, index) => ({ id: String(index), team_id: team, title: "Träning" })));
  state.generate.mockImplementationOnce(async () => {
    const result = await state.options.mock.calls[0][0].tools.readWorkspaceActivities.execute({});
    expect(result.activities).toHaveLength(60); expect(result.hasMore).toBe(true);
    return { text: "De första 60 aktiviteterna" };
  });
  await answerWorkspaceAssistant(input, dependencies);
  expect(queries.find(query => query.table === "activities")?.filters).toEqual([["team_id", [team]], ["status", "published"]]);
  expect(supabase.from.mock.calls.map(([table]) => table)).not.toContain("invitations");
});

const memberRows = [
  { id: "m1", person_id: "person-1", team_id: team, role: "participant" },
  { id: "m2", person_id: "person-2", team_id: team, role: "leader" },
];

it("uses verified member counts instead of fabricated model prose for club questions", async () => {
  const { dependencies } = setup(true, [], memberRows);
  state.generate.mockImplementationOnce(async () => {
    await state.options.mock.calls[0][0].tools.readWorkspaceMembers.execute({ mode: "summary" });
    return { text: "Det finns 11 spelare och inga ledare i laget." };
  });
  const reply = await answerWorkspaceAssistant({ ...input, question: "Hur många ledare respektive spelare har klubben?" }, dependencies);
  expect(reply.answer).toContain("Klubben");
  expect(reply.answer).toContain("1 spelare och 1 ledare");
  expect(reply.answer).not.toContain("11 spelare");
  expect(state.team).not.toHaveBeenCalled();
});

for (const generationFails of [false, true]) {
  it(`omits an earlier member-tool error after a verified retry, generationFails=${generationFails}`, async () => {
    const { dependencies } = setup(true, [], memberRows);
    state.generate.mockImplementationOnce(async () => {
      const execute = state.options.mock.calls[0][0].tools.readWorkspaceMembers.execute;
      expect(await execute({ mode: "summary", responsibilityTypeId: "unknown" })).toHaveProperty("error");
      expect(await execute({ mode: "summary" })).toHaveProperty("summary");
      if (generationFails) throw new Error("generation failed");
      return { text: "Felaktig modelltext" };
    });
    const reply = await answerWorkspaceAssistant(input, dependencies);
    expect(reply.answer).toContain("1 spelare och 1 ledare");
    expect(reply.answer).not.toContain("kunde inte läsas");
    expect(reply.answer).not.toContain("Felaktig modelltext");
  });
  it(`returns the member-tool error when no verified read succeeds, generationFails=${generationFails}`, async () => {
    const { dependencies } = setup();
    state.generate.mockImplementationOnce(async () => {
      await state.options.mock.calls[0][0].tools.readWorkspaceMembers.execute({ mode: "summary", responsibilityTypeId: "unknown" });
      if (generationFails) throw new Error("generation failed");
      return { text: "Det finns inga spelare." };
    });
    const reply = await answerWorkspaceAssistant(input, dependencies);
    expect(reply.answer).toContain("kunde inte läsas");
    expect(reply.answer).not.toContain("inga spelare");
  });
}
