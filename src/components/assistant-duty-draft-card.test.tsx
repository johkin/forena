import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@/app/assistant-duties/actions", () => ({ confirmAssistantDuties: vi.fn() }));
import { AssistantDutyDraftCard } from "./assistant-duty-draft-card";
import { confirmAssistantDuties } from "@/app/assistant-duties/actions";
import type { ActivityDutyDraft } from "@/lib/ai/activity-duty-draft";
const draft: ActivityDutyDraft = {
  teamId: "team", timeZone: "Europe/Stockholm", command: { activityIds: ["id"], name: "Sekretariat", places: 2, instructions: "<script>alert(1)</script>" },
  preview: { fingerprint: "a".repeat(32), activities: [{ id: "id", title: "Match <b>test</b>", startsAt: "2030-10-10T10:00:00Z", endsAt: "2030-10-10T11:00:00Z", category: "competition", venue: "home", sourceKind: "imported", externalSource: "league", seriesId: null, seriesTitle: null, exists: false }] },
};
it("renders the exact reviewed activity, local time, capacity and explicit confirmation without writes", () => {
  const html = renderToStaticMarkup(<AssistantDutyDraftCard draft={draft} />);
  expect(html).toContain("Sekretariat · 2 platser per aktivitet");
  expect(html).toContain("12:00"); expect(html).toContain("13:00");
  expect(html).toContain("Importerad"); expect(html).toContain("Hemma");
  expect(html).toContain("Spara uppgifter"); expect(html).toContain("Avvisa");
  expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
  expect(confirmAssistantDuties).not.toHaveBeenCalled();
});
it("marks existing duties and disables a no-op confirmation", () => {
  const html = renderToStaticMarkup(<AssistantDutyDraftCard draft={{ ...draft, preview: { ...draft.preview, activities: draft.preview.activities.map(a => ({ ...a, exists: true })) } }} />);
  expect(html).toContain("Finns redan"); expect(html).toContain("0 nya uppgifter");
  expect(html).toContain('disabled=""');
});
