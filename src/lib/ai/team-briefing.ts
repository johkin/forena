import { generateText, jsonSchema, Output, type LanguageModel } from "ai";

export type TeamSignal = {
  id: string;
  kind: "activity" | "invitation" | "task" | "instruction";
  title: string;
  detail: string;
  dueAt: string;
  importance: "normal" | "high";
};

export type TeamBriefingItem = {
  signalId: string;
  reason: string;
};

export type TeamBriefing = {
  headline: string;
  summary: string;
  items: TeamBriefingItem[];
};

export type TeamBriefingResult = {
  briefing: TeamBriefing;
  usage: { inputTokens?: number; outputTokens?: number };
};

function urgency(signal: TeamSignal, now: Date) {
  const hours = (new Date(signal.dueAt).getTime() - now.getTime()) / 3_600_000;
  const dueScore = hours <= 0 ? 100 : hours <= 24 ? 60 : hours <= 72 ? 30 : 0;
  return dueScore + (signal.importance === "high" ? 25 : 0) + (signal.kind === "invitation" ? 10 : 0);
}

export function createFallbackBriefing(signals: TeamSignal[], now = new Date()): TeamBriefing {
  const items = [...signals]
    .sort((left, right) => urgency(right, now) - urgency(left, now))
    .slice(0, 4)
    .map((signal) => ({
      signalId: signal.id,
      reason: signal.dueAt <= now.toISOString() ? "Tiden har passerat och behöver följas upp." : "Detta ligger närmast i tid.",
    }));

  return {
    headline: items.length ? "Det viktigaste för laget" : "Inget kräver åtgärd just nu",
    summary: items.length
      ? "Översikten är prioriterad efter tid och angelägenhetsgrad."
      : "Det finns inga öppna signaler att prioritera.",
    items,
  };
}

export function validateTeamBriefing(value: unknown, signalIds: Set<string>): TeamBriefing | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<TeamBriefing>;
  if (typeof candidate.headline !== "string" || typeof candidate.summary !== "string" || !Array.isArray(candidate.items)) return null;
  if (candidate.headline.length > 100 || candidate.summary.length > 360 || candidate.items.length > 4) return null;
  const seen = new Set<string>();
  const items: TeamBriefingItem[] = [];
  for (const item of candidate.items) {
    if (!item || typeof item !== "object") return null;
    const entry = item as Partial<TeamBriefingItem>;
    if (typeof entry.signalId !== "string" || !signalIds.has(entry.signalId) || seen.has(entry.signalId)) return null;
    if (typeof entry.reason !== "string" || entry.reason.length > 180) return null;
    seen.add(entry.signalId);
    items.push({ signalId: entry.signalId, reason: entry.reason });
  }
  return { headline: candidate.headline, summary: candidate.summary, items };
}

export async function generateTeamBriefing(options: {
  signals: TeamSignal[];
  model: LanguageModel;
  userReference?: string;
}): Promise<TeamBriefingResult> {
  const signalIds = new Set(options.signals.map((signal) => signal.id));
  const schema = jsonSchema<TeamBriefing>({
    type: "object",
    additionalProperties: false,
    properties: {
      headline: { type: "string", maxLength: 100 },
      summary: { type: "string", maxLength: 360 },
      items: {
        type: "array",
        maxItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            signalId: { type: "string", enum: [...signalIds] },
            reason: { type: "string", maxLength: 180 },
          },
          required: ["signalId", "reason"],
        },
      },
    },
    required: ["headline", "summary", "items"],
  });

  const result = await generateText({
    model: options.model,
    output: Output.object({ schema }),
    instructions: [
      "Du prioriterar en svensk idrottsförenings lagöversikt för en ledare.",
      "Använd endast de givna signalerna. Hitta inte på personer, aktiviteter eller uppgifter.",
      "Skriv kort, konkret och på svenska. Prioritera sådant som snart förfaller eller kräver handling.",
      "Returnera högst fyra signaler och referera exakt till signalernas id.",
    ].join(" "),
    prompt: JSON.stringify({ currentTime: new Date().toISOString(), signals: options.signals }),
    maxOutputTokens: 500,
    abortSignal: AbortSignal.timeout(15_000),
    providerOptions: options.userReference ? {
      gateway: { user: options.userReference, tags: ["feature:team-briefing"] },
    } : undefined,
  });

  const briefing = validateTeamBriefing(result.output, signalIds);
  if (!briefing) throw new Error("invalid_model_output");

  return {
    briefing,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    },
  };
}
