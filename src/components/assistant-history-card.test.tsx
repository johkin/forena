import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { ActivityHistoryResult } from "@/lib/ai/activity-history-result";
import { AssistantHistoryCard } from "./assistant-history-card";

it.each([
  ["Pacific/Kiritimati", "6 okt. 01:30"],
  ["Pacific/Apia", "6 okt. 00:30"],
  ["Etc/GMT+12", "4 okt. 23:30"],
  ["Europe/Stockholm", "5 okt. 13:30"],
])("preserves calendar boundaries in %s while showing activity time locally", (timeZone, activityTime) => {
  const result: ActivityHistoryResult = {
    team: "Lag A", from: "2026-09-16", through: "2026-10-06", timeZone,
    category: "session", activityCount: 1, unreportedActivityCount: 0, truncated: false,
    summary: { uniquePeople: 1, participationCount: 1 },
    activities: [{ id: "activity", title: "Träning", startsAt: "2026-10-05T11:30:00Z", attendanceReported: true, participationCount: 1 }],
  };
  const html = renderToStaticMarkup(<AssistantHistoryCard result={result} />);
  expect(html).toContain("16 sep. 2026–6 okt. 2026");
  expect(html).toContain(activityTime);
  expect(html).toContain('aria-label="Öppna Träning"');
  expect(html).toContain("1 person");
  expect(html).not.toContain("1 personer");
  expect(html).toContain("1 registrerat deltagartillfälle");
});

it("links an activity mentioned in the answer without a second collapsible list", () => {
  const result: ActivityHistoryResult = { team: "F2016", from: "2026-10-01", through: "2026-10-07", timeZone: "Europe/Stockholm", category: "session", activityCount: 1, unreportedActivityCount: 0, truncated: false, summary: { uniquePeople: 1, participationCount: 1 }, activities: [{ id: "id", title: "Träning Örvallen", startsAt: "2026-10-05T15:00:00Z", attendanceReported: true, participationCount: 1 }] };
  const html = renderToStaticMarkup(<AssistantHistoryCard result={result} answer="Registrerad närvaro på Träning Örvallen den 5 oktober." />);
  expect(html).toContain('aria-label="Öppna Träning Örvallen"');
  expect(html.match(/aria-label="Öppna/g)).toHaveLength(1);
  expect(html).not.toContain("<details");expect(html).not.toContain("Aktiviteter:");
});

it("labels invitation totals without claiming attendance", () => {
  const result: ActivityHistoryResult = { kind: "invitations", sourceTeam: "F2016", team: "F2013", from: "2026-10-07", through: "2026-10-08", timeZone: "Europe/Stockholm", category: "session", activityCount: 1, unreportedActivityCount: null, truncated: false, summary: { uniquePeople: 1, participationCount: 1 }, activities: [{ id: "activity", title: "Träning Örvallen", startsAt: "2026-10-08T15:00:00Z", attendanceReported: false, participationCount: 1 }] };
  const html = renderToStaticMarkup(<AssistantHistoryCard result={result} />);
  expect(html).toContain("spelare från F2016");expect(html).toContain("1 kallelsetillfälle");expect(html).not.toContain("närvarande");expect(html).not.toContain("<details");
});
