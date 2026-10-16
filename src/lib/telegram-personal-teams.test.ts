import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("./ai/team-assistant", () => ({ answerTeamAssistant: vi.fn() }));
import { telegramPersonalTeams } from "./telegram-assistant";
import type { AssistantDependencies } from "./ai/team-assistant-types";
const rows: Record<string, Record<string, unknown>[]> = {};
let failure = "";
const queries: { table: string; eq: ReturnType<typeof vi.fn>; in: ReturnType<typeof vi.fn> }[] = [];
const supabase = { from: (table: string) => {
  let selected = rows[table] ?? [];
  const query = {
    select: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
    eq: vi.fn((key: string, value: unknown) => { selected = selected.filter(row => row[key] === value); return query; }),
    in: vi.fn((key: string, values: unknown[]) => { selected = selected.filter(row => values.includes(row[key])); return query; }),
    is: vi.fn((key: string, value: unknown) => { selected = selected.filter(row => row[key] === value); return query; }),
    then: (resolve: (value: unknown) => void) => resolve({ data: selected, error: failure === table ? {} : null }),
  };
  queries.push({ table, eq: query.eq, in: query.in });
  return query;
} } as unknown as AssistantDependencies["supabase"];
beforeEach(() => {
  failure = ""; queries.length = 0;
  rows.people = [{ id: "a", display_name: "Tilda Kindgren", user_id: null }, { id: "b", display_name: "Johan Kindgren", user_id: null }, { id: "stranger", display_name: "Other", user_id: "other" }];
  rows.person_guardians = [{ person_id: "a", guardian_user_id: "user" }, { person_id: "b", guardian_user_id: "user" }, { person_id: "stranger", guardian_user_id: "other" }];
  rows.memberships = [
    { person_id: "a", team_id: "f2016", role: "participant", ends_on: null },
    { person_id: "b", team_id: "p2014", role: "participant", ends_on: null },
    { person_id: "stranger", team_id: "other", role: "participant", ends_on: null },
    { person_id: "a", team_id: "old", role: "participant", ends_on: "2025-01-01" },
  ];
});
it("derives the family's current teams without including other members or ended memberships", async () => {
  expect(await telegramPersonalTeams(supabase, "user", "När är nästa träning?")).toEqual([
    { teamId: "f2016", people: ["Tilda Kindgren"] }, { teamId: "p2014", people: ["Johan Kindgren"] },
  ]);
  expect(queries.find(q => q.table === "person_guardians")?.eq).toHaveBeenCalledWith("guardian_user_id", "user");
});
it("routes a child's first or full name only through the verified family", async () => {
  expect(await telegramPersonalTeams(supabase, "user", "När tränar Tilda?")).toEqual([{ teamId: "f2016", people: ["Tilda Kindgren"] }]);
  expect(await telegramPersonalTeams(supabase, "user", "När tränar Johan Kindgren?")).toEqual([{ teamId: "p2014", people: ["Johan Kindgren"] }]);
});
it("supports a player's own account", async () => {
  rows.person_guardians = []; rows.people[0].user_id = "user";
  expect(await telegramPersonalTeams(supabase, "user", "När tränar jag?")).toEqual([{ teamId: "f2016", people: ["Tilda Kindgren"] }]);
});
it("does not infer family access from visible names when guardianship was revoked", async () => {
  rows.person_guardians = [];
  expect(await telegramPersonalTeams(supabase, "user", "Tilda")).toEqual([]);
});
it("fails closed on permission or query errors", async () => {
  failure = "person_guardians";
  await expect(telegramPersonalTeams(supabase, "user", "Träning?")).rejects.toThrow("people_failed");
});
