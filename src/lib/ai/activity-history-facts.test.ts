import { expect, it, vi } from "vitest";
import { filterHistoryRole, historyMemberRole, verifiedHistoryAnswer } from "./activity-history-facts";
import type { ActivityHistoryResult } from "./activity-history-result";
import type { AssistantDependencies } from "./team-assistant-types";
const history: ActivityHistoryResult = { team: "F2016", from: "2026-10-01", through: "2026-10-07", timeZone: "Europe/Stockholm", category: "session", activityCount: 1, unreportedActivityCount: 0, truncated: false,
  summary: { uniquePeople: 1, participationCount: 1 }, activities: [{ id: "activity", title: "Träning Örvallen", startsAt: "2026-10-05T15:00:00Z", attendanceReported: true, participationCount: 1 }],
  records: [{ personId: "player", name: "Tilda", activityId: "activity", startsAt: "2026-10-05T15:00:00Z", attendance: "present" }, { personId: "leader", name: "Johan", activityId: "activity", startsAt: "2026-10-05T15:00:00Z", attendance: "not_recorded" }] };
function setup(rows = [{ person_id: "leader", starts_on: "2026-01-01", ends_on: null as string | null }], error: unknown = null, count = rows.length) {
  const builder = { select: vi.fn(), eq: vi.fn(), in: vi.fn(async () => ({ data: rows, error, count })) };
  builder.select.mockReturnValue(builder);builder.eq.mockReturnValue(builder);
  const supabase = { from: vi.fn(() => builder) } as unknown as AssistantDependencies["supabase"];
  return { supabase, builder };
}
it("an accepted but unrecorded leader is not counted or described as having attended", async () => {
  const { supabase, builder } = setup();
  const result = await filterHistoryRole(supabase, "org", "team", history, "leader");
  expect(result).toMatchObject({ summary: { uniquePeople: 0, participationCount: 0 }, records: [], activities: [{ participationCount: 0 }] });
  expect(builder.eq).toHaveBeenCalledWith("organization_id", "org");expect(builder.eq).toHaveBeenCalledWith("team_id", "team");expect(builder.eq).toHaveBeenCalledWith("role", "leader");
  const answer = verifiedHistoryAnswer(result as ActivityHistoryResult, "Vilka ledare har tränat i oktober?");
  expect(answer).not.toContain("Johan");expect(answer).toContain("Ingen registrerad närvaro");expect(answer).toContain("bevisar inte att ingen var där");
});
it("lists only people with recorded attendance and counts a person once across sessions", async () => {
  const { supabase } = setup();
  const records = [history.records![1], { ...history.records![1], activityId: "second" }].map(r => ({ ...r, attendance: "present" as const }));
  const result = await filterHistoryRole(supabase, "org", "team", { ...history, records }, "leader");
  expect(result).toMatchObject({ summary: { uniquePeople: 1, participationCount: 2 } });
  expect(verifiedHistoryAnswer(result as ActivityHistoryResult, "Vilka ledare har tränat?")).toContain("Registrerad närvaro: Johan.");
});
it.each(["2026-10-04", "2026-10-05"])("uses the role at the local activity date (membership ends %s)", async ends_on => {
  const { supabase } = setup([{ person_id: "player", starts_on: "2026-01-01", ends_on }]);
  const result = await filterHistoryRole(supabase, "org", "team", history, "leader");
  expect(result).toMatchObject({ summary: { uniquePeople: ends_on === "2026-10-05" ? 1 : 0 } });
});
it("rejects truncated details instead of giving an incomplete role total", async () => {
  const { supabase } = setup();
  expect(await filterHistoryRole(supabase, "org", "team", { ...history, truncated: true }, "leader")).toHaveProperty("error");
  expect(supabase.from).not.toHaveBeenCalled();
});
it.each([true, false])("rejects failed or partial membership lookups (error %s)", async failed => {
  const { supabase } = setup(undefined, failed ? { message: "unavailable" } : null, 2);
  expect(await filterHistoryRole(supabase, "org", "team", history, "leader")).toHaveProperty("error");
});
it("formats a verified answer without turning invitations into attendance", () => {
  const answer = verifiedHistoryAnswer(history, "Vilka har tränat?");expect(answer).toContain("Tilda");expect(answer).not.toContain("Johan");
  expect(historyMemberRole("Vilka ledare har tränat i oktober?")).toBe("leader");expect(historyMemberRole("Hur många spelare tränade?")).toBe("participant");
});
