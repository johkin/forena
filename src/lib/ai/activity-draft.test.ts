import { describe, expect, it } from "vitest";
import { activityDraftNeedsWebResearch, isActivityDraftRequest, normalizeActivityDraft, searchSourcesFromToolResults } from "./activity-draft";
import { previewWeeklySeries } from "../activity-series";
import { isActivityHistoryQuestion } from "./activity-history-intent";

const trainingDraft = {
  title: "Träning", description: "Välkomna!", location: "Ursviks IP",
  startsOn: "2026-10-20", startTime: "18:00", durationMinutes: 90, gatheringMinutesBefore: 15,
} as const;

describe("activity draft intent", () => {
  it.each(["Skapa en påminnelse till nästa match", "Lägg till påminnelse för träning", "Kan du lägga till en påminnelse för träning", "Påminn alla som inte svarat på vår match", "Jag vill ha en påminnelse för träning", "Fixa en påminnelse för match"])("routes reminder requests to the assistant tools: %s", question => {
    expect(isActivityDraftRequest(question)).toBe(false);
  });
  it("keeps requests for training history in the read-only flow", () => {
    expect(isActivityDraftRequest("Jag vill ha historik för träningar de senaste tre veckorna")).toBe(false);
    expect(isActivityDraftRequest("Jag vill ha information om nästa träning")).toBe(false);
  });
  it.each([
    "Skapa återkommande aktiviteter varje tisdag och torsdag",
    "Fixa återkommande träningar varje tisdag",
    "Jag vill ha träningar varje fredag på Ursvik IP kl 16:15-17:15. Start 7 september och november ut",
    "Lägg till träningar på måndagar under oktober",
    "Förbered en aktivitetsserie varje vecka",
    "Skapa matcher varje lördag",
    "Schemalägg återkommande träningar varje tisdag",
    "Skapa en träning och påminn oss innan",
    'kan du lägga till träning "Spela mera F2014-2016" på fredagar kl 16:15-17:15 med slut sista november',
    "Kan du lägga in träningar på fredagar till sista november?",
    "Kan du göra en träning på fredag med slut sista november?",
    "Kan du schemalägga träningar på fredagar till sista november?",
  ])("recognizes recurring creation requests: %s", question => {
    expect(isActivityDraftRequest(question)).toBe(true);
    expect(isActivityHistoryQuestion(question)).toBe(false);
    expect(activityDraftNeedsWebResearch(question)).toBe(false);
  });
  it.each(["Hur många har tränat de sista tre veckorna?", "Vilka deltog på sista träningen i november?", "Jag vill ha historik för träningar de senaste tre veckorna"])("preserves actual history requests: %s", question => {
    expect(isActivityDraftRequest(question)).toBe(false);
    expect(isActivityHistoryQuestion(question)).toBe(true);
  });
  it("recognizes explicit creation requests and external events", () => {
    expect(isActivityDraftRequest("Skapa en intresseanmälan för att vara med på Aroscupen")).toBe(true);
    expect(activityDraftNeedsWebResearch("Skapa en intresseanmälan för Aroscupen")).toBe(true);
    expect(isActivityDraftRequest("Vad händer på nästa träning?")).toBe(false);
    expect(activityDraftNeedsWebResearch("Skapa en träning på torsdag")).toBe(false);
  });
});

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
