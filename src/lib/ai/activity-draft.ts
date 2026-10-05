import { previewWeeklySeries } from "../activity-series";

export const activityDurations = [30, 45, 60, 75, 90, 120, 180, 480] as const;
export const gatheringOffsets = [0, 15, 30, 45, 60] as const;

export type ActivityDraftSource = {
  title: string;
  url: string;
};

export type ActivityDraft = {
  title: string;
  description: string;
  location: string;
  startsOn: string;
  startTime: string;
  durationMinutes: (typeof activityDurations)[number];
  gatheringMinutesBefore: (typeof gatheringOffsets)[number];
  recurrence?: { weekdays: number[]; endsOn: string | null } | null;
  sources: ActivityDraftSource[];
};

export type ActivityDraftInput = Omit<ActivityDraft, "sources">;

export function isActivityDraftRequest(question: string) {
  const normalized = question.trim().toLocaleLowerCase("sv-SE");
  if (/^påminn\b/.test(normalized) || /\b(?:skapa|gör|förbered|lägg till|skriv|planera|schemalägg)\s+(?:en\s+)?påminnelse(?:r)?\b/.test(normalized)) return false;
  const action = /\b(skapa|gör|förbered|lägg till|skriv|planera|schemalägg)\b/.test(normalized);
  const activity = /\b(aktivitet(?:er)?|träning(?:ar)?|match(?:er)?|turnering(?:ar)?|läger|intresseanmälan|kallelse(?:r)?|aktivitetsserie)\b/.test(normalized) || /cup(?:en)?\b/.test(normalized);
  return action && activity;
}

export function activityDraftNeedsWebResearch(question: string) {
  return /cup(?:en)?\b|\b(turnering|läger|evenemang)\b/i.test(question);
}

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} saknas i aktivitetsutkastet.`);
  return value.trim().slice(0, maxLength);
}

function allowedNumber<const T extends readonly number[]>(value: unknown, allowed: T, fallback: T[number]) {
  return typeof value === "number" && allowed.includes(value) ? value as T[number] : fallback;
}

export function normalizeActivityDraft(input: ActivityDraftInput): ActivityDraftInput {
  const startsOn = requiredText(input.startsOn, "Datum", 10);
  const startTime = requiredText(input.startTime, "Tid", 5);
  const parsedDate = new Date(`${startsOn}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== startsOn) {
    throw new Error("Aktivitetsutkastet har ett ogiltigt datum.");
  }
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime)) throw new Error("Aktivitetsutkastet har en ogiltig tid.");

  let recurrence: ActivityDraftInput["recurrence"];
  if (input.recurrence != null) {
    const { weekdays, endsOn } = input.recurrence;
    if (!Array.isArray(weekdays) || !weekdays.length || weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7)) {
      throw new Error("Aktivitetsserien har ogiltiga veckodagar.");
    }
    if (endsOn !== null) {
      const end = typeof endsOn === "string" ? new Date(`${endsOn}T00:00:00Z`) : new Date(NaN);
      if (typeof endsOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn) || Number.isNaN(end.getTime()) || end.toISOString().slice(0, 10) !== endsOn || endsOn < startsOn) {
        throw new Error("Aktivitetsserien har ett ogiltigt slutdatum.");
      }
    }
    recurrence = { weekdays: [...new Set(weekdays)].sort((a, b) => a - b), endsOn };
    // Reuse the editor's limits and reject empty or oversized series before opening it.
    if (endsOn !== null) previewWeeklySeries({ startsOn, endsOn, weekdays: recurrence.weekdays, startTime,
      durationMinutes: allowedNumber(input.durationMinutes, activityDurations, 90),
      gatheringMinutesBefore: allowedNumber(input.gatheringMinutesBefore, gatheringOffsets, 0), timeZone: "UTC" });
  }

  return {
    title: requiredText(input.title, "Titel", 160),
    description: requiredText(input.description, "Beskrivning", 5_000),
    location: requiredText(input.location, "Plats", 240),
    startsOn,
    startTime,
    durationMinutes: allowedNumber(input.durationMinutes, activityDurations, 90),
    gatheringMinutesBefore: allowedNumber(input.gatheringMinutesBefore, gatheringOffsets, 0),
    ...(recurrence ? { recurrence } : {}),
  };
}

function safeHttpUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Extract only URLs returned by the executed search tool, never model-invented citations. */
export function searchSourcesFromToolResults(toolResults: unknown): ActivityDraftSource[] {
  if (!Array.isArray(toolResults)) return [];
  const sources: ActivityDraftSource[] = [];
  const seen = new Set<string>();

  for (const item of toolResults) {
    if (!item || typeof item !== "object" || (item as { toolName?: unknown }).toolName !== "perplexity_search") continue;
    const output = (item as { output?: unknown }).output;
    if (!output || typeof output !== "object") continue;
    const results = (output as { results?: unknown }).results;
    if (!Array.isArray(results)) continue;
    for (const result of results) {
      if (!result || typeof result !== "object") continue;
      const url = safeHttpUrl((result as { url?: unknown }).url);
      if (!url || seen.has(url)) continue;
      const rawTitle = (result as { title?: unknown }).title;
      sources.push({ title: typeof rawTitle === "string" && rawTitle.trim() ? rawTitle.trim().slice(0, 200) : new URL(url).hostname, url });
      seen.add(url);
      if (sources.length === 5) return sources;
    }
  }
  return sources;
}
