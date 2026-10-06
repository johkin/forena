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
});
