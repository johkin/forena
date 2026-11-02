import { describe, expect, it } from "vitest";
import { assistantActivityDraft, assistantActivityEditorSchema } from "./assistant-activity-editor";

const editor = assistantActivityEditorSchema.parse({
  teamId: "11111111-1111-4111-8111-111111111111", recurring: true,
  title: "Träning", description: "", location: "", weekdays: [2, 4],
});
describe("assistant activity editor", () => {
  it("opens incomplete recurring training in the team's local time without inventing place or end date", () => {
    const draft = assistantActivityDraft(editor, "Europe/Stockholm", new Date("2026-11-02T23:37:00Z"));
    expect(draft).toMatchObject({ startsOn: "2026-11-03", startTime: "00:35", location: "",
      recurrence: { weekdays: [2, 4], endsOn: null } });
  });
  it("preserves explicit dates, clock time and activity type", () => {
    const draft = assistantActivityDraft({ ...editor, startsOn: "2027-03-30", startTime: "18:30:00",
      endsOn: "2027-06-01", activityTypeId: editor.teamId }, "Europe/Stockholm");
    expect(draft).toMatchObject({ startsOn: "2027-03-30", startTime: "18:30", activityTypeId: editor.teamId,
      recurrence: { weekdays: [2, 4], endsOn: "2027-06-01" } });
  });
  it("keeps single activities out of series mode and rejects invalid weekdays", () => {
    expect(assistantActivityDraft({ ...editor, recurring: false }, "UTC").recurrence).toBeNull();
    expect(assistantActivityEditorSchema.safeParse({ ...editor, weekdays: [0, 8] }).success).toBe(false);
  });
});
