import { describe, expect, it } from "vitest";
import { normalizeActivityDraft, searchSourcesFromToolResults } from "./activity-draft";
import { previewWeeklySeries } from "../activity-series";

const trainingDraft = {
  title: "Träning", description: "Välkomna!", location: "Ursviks IP",
  startsOn: "2026-10-20", startTime: "18:00", durationMinutes: 90, gatheringMinutesBefore: 15,
} as const;

describe("normalizeActivityDraft", () => {
  it("preserves weekdays and period through normalization and series preview across DST", () => {
    const draft = normalizeActivityDraft({ ...trainingDraft, recurrence: { weekdays: [4, 2, 4], endsOn: "2026-10-29" } });
    expect(draft.recurrence).toEqual({ weekdays: [2, 4], endsOn: "2026-10-29" });
    const occurrences = previewWeeklySeries({ ...draft, endsOn: draft.recurrence!.endsOn!, weekdays: draft.recurrence!.weekdays, timeZone: "Europe/Stockholm" });
    expect(occurrences.map(item => item.startsAt)).toEqual([
      "2026-10-20T16:00:00.000Z", "2026-10-22T16:00:00.000Z",
      "2026-10-27T17:00:00.000Z", "2026-10-29T17:00:00.000Z",
    ]);
  });

  it("keeps an unspecified end date for the leader to complete", () => {
    expect(normalizeActivityDraft({ ...trainingDraft, recurrence: { weekdays: [2], endsOn: null } }).recurrence)
      .toEqual({ weekdays: [2], endsOn: null });
  });

  it.each([[], [0], [8], [1.5]].map(weekdays => ({ weekdays })))("rejects invalid weekdays $weekdays", ({ weekdays }) => {
    expect(() => normalizeActivityDraft({ ...trainingDraft, recurrence: { weekdays, endsOn: null } })).toThrow("ogiltiga veckodagar");
  });

  it.each(["2026-02-30", "2026-10-19", "ogiltigt"])("rejects invalid series end dates %s", endsOn => {
    expect(() => normalizeActivityDraft({ ...trainingDraft, recurrence: { weekdays: [2], endsOn } })).toThrow("ogiltigt slutdatum");
  });

  it("rejects empty and oversized series", () => {
    expect(() => normalizeActivityDraft({ ...trainingDraft, recurrence: { weekdays: [1], endsOn: "2026-10-20" } })).toThrow("inga valda veckodagar");
    expect(() => normalizeActivityDraft({ ...trainingDraft, recurrence: { weekdays: [1,2,3,4,5,6,7], endsOn: "2027-10-20" } })).toThrow("högst 100");
  });

  it("keeps single activity drafts compatible", () => {
    expect(normalizeActivityDraft({ ...trainingDraft, recurrence: null })).toEqual(trainingDraft);
  });
  it("validates and normalizes a proposed activity", () => {
    expect(normalizeActivityDraft({
      title: "  Intresseanmälan: Aroscupen  ",
      description: "Kan ert barn följa med?",
      location: "Västerås",
      startsOn: "2027-06-18",
      startTime: "09:00",
      durationMinutes: 480,
      gatheringMinutesBefore: 30,
    })).toEqual({
      title: "Intresseanmälan: Aroscupen",
      description: "Kan ert barn följa med?",
      location: "Västerås",
      startsOn: "2027-06-18",
      startTime: "09:00",
      durationMinutes: 480,
      gatheringMinutesBefore: 30,
    });
  });

  it("rejects invalid dates and times", () => {
    expect(() => normalizeActivityDraft({
      title: "Cup", description: "Information", location: "Västerås",
      startsOn: "nästa fredag", startTime: "morgon", durationMinutes: 90, gatheringMinutesBefore: 0,
    })).toThrow("ogiltigt datum");
    expect(() => normalizeActivityDraft({
      title: "Cup", description: "Information", location: "Västerås",
      startsOn: "2027-02-30", startTime: "09:00", durationMinutes: 90, gatheringMinutesBefore: 0,
    })).toThrow("ogiltigt datum");
  });
});

describe("searchSourcesFromToolResults", () => {
  it("keeps deduplicated web sources only from the search tool", () => {
    expect(searchSourcesFromToolResults([
      { toolName: "getTeamMemberNames", output: { results: [{ title: "Fel", url: "https://example.com/private" }] } },
      { toolName: "perplexity_search", output: { results: [
        { title: "Aroscupen", url: "https://www.aroscupen.se/" },
        { title: "Dubblett", url: "https://www.aroscupen.se/" },
        { title: "Osäker", url: "javascript:alert(1)" },
      ] } },
    ])).toEqual([{ title: "Aroscupen", url: "https://www.aroscupen.se/" }]);
  });
});
