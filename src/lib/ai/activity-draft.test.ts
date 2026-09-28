import { describe, expect, it } from "vitest";
import { activityDraftNeedsWebResearch, isActivityDraftRequest, normalizeActivityDraft, searchSourcesFromToolResults } from "./activity-draft";

describe("activity draft intent", () => {
  it("recognizes explicit creation requests and external events", () => {
    expect(isActivityDraftRequest("Skapa en intresseanmälan för att vara med på Aroscupen")).toBe(true);
    expect(activityDraftNeedsWebResearch("Skapa en intresseanmälan för Aroscupen")).toBe(true);
    expect(isActivityDraftRequest("Vad händer på nästa träning?")).toBe(false);
    expect(activityDraftNeedsWebResearch("Skapa en träning på torsdag")).toBe(false);
  });
});

describe("normalizeActivityDraft", () => {
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
