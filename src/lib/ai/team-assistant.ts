import { createHash } from "node:crypto";
import { generateText, gateway, isStepCount, Output, ToolLoopAgent } from "ai";
import { activityDraftNeedsWebResearch, isActivityDraftRequest, normalizeActivityDraft, searchSourcesFromToolResults, type ActivityDraft } from "./activity-draft";
import { activityDraftSchema } from "./activity-draft-schema";
import { loadTeamAssistantContext } from "./team-assistant-context";
import { buildActivityDraftPrompt, buildEventResearchPrompt, buildTeamAssistantPrompt } from "./team-assistant-prompts";
import { createTeamAssistantTools } from "./team-assistant-tools";
import { createAssistantMemoryTools } from "./assistant-memory-tools";
import type { AssistantMemoryDraft } from "./assistant-memory-draft";
import { TeamAssistantError, type AssistantDependencies, type TeamAssistantInput, type TeamAssistantReply } from "./team-assistant-types";

// Keep the model already exercised by the production team briefing.
const DEFAULT_MODEL = "google/gemini-2.5-flash-lite";

export async function answerTeamAssistant(input: TeamAssistantInput, dependencies: AssistantDependencies): Promise<TeamAssistantReply> {
  const startedAt = Date.now();
  const { teamId, question } = input;
  const { supabase, userId } = dependencies;
  const { organization, activities, activityIds, canManageActivities, memoryScope, context, organizationToday } = await loadTeamAssistantContext(input, dependencies);
  const model = process.env.AI_ASSISTANT_MODEL?.trim() || process.env.AI_FEED_MODEL?.trim() || DEFAULT_MODEL;
  const requiresActivityDraft = Boolean(canManageActivities) && isActivityDraftRequest(question);
  const requiresWebResearch = requiresActivityDraft && activityDraftNeedsWebResearch(question);

  try {
    if (requiresActivityDraft) {
      let researchToolResults: unknown[] = [];
      let researchUsage = { inputTokens: 0, outputTokens: 0 };

      if (requiresWebResearch) {
        const research = await generateText({
          model,
          tools: {
            perplexity_search: gateway.tools.perplexitySearch({
              maxResults: 5,
              maxTokensPerPage: 700,
              maxTokens: 3_500,
              country: "SE",
              searchLanguageFilter: ["sv", "en"],
            }),
          },
          toolChoice: { type: "tool", toolName: "perplexity_search" },
          prompt: buildEventResearchPrompt(organizationToday, question),
          maxOutputTokens: 250,
          providerOptions: { gateway: { user: createHash("sha256").update(userId).digest("hex").slice(0, 24), tags: ["feature:team-assistant", "step:event-research"] } },
          abortSignal: AbortSignal.timeout(15_000),
        });
        researchToolResults = research.toolResults;
        researchUsage = { inputTokens: research.usage.inputTokens ?? 0, outputTokens: research.usage.outputTokens ?? 0 };
      }

      const draftResult = await generateText({
        model,
        output: Output.object({
          name: "activityDraft",
          description: "Ett validerat utkast till en aktivitet som ledaren ska granska innan den sparas.",
          schema: activityDraftSchema,
        }),
        system: buildActivityDraftPrompt(),
        prompt: JSON.stringify({ context, previousMessages: input.messages, question, webResearch: researchToolResults }),
        maxOutputTokens: 700,
        providerOptions: { gateway: { user: createHash("sha256").update(userId).digest("hex").slice(0, 24), tags: ["feature:team-assistant", "step:activity-draft"] } },
        abortSignal: AbortSignal.timeout(20_000),
      });

      const normalized = normalizeActivityDraft(draftResult.output);
      if (normalized.startsOn < organizationToday) throw new Error("Aktivitetsdatumet har redan passerat. Sök efter nästa kommande upplaga.");
      const activityDraft: ActivityDraft = { ...normalized, sources: searchSourcesFromToolResults(researchToolResults) };
      console.info("team_assistant_completed", {
        teamId,
        model,
        latencyMs: Date.now() - startedAt,
        inputTokens: researchUsage.inputTokens + (draftResult.usage.inputTokens ?? 0),
        outputTokens: researchUsage.outputTokens + (draftResult.usage.outputTokens ?? 0),
        mode: "activity-draft",
      });
      return {
        answer: normalized.recurrence
          ? `Jag har öppnat ett utkast till en aktivitetsserie som du kan granska och justera innan den sparas.${normalized.recurrence.endsOn === null ? " Fyll i slutdatum för serien innan du förhandsgranskar." : ""}`
          : "Jag har öppnat ett aktivitetsutkast som du kan granska och justera innan det sparas.",
        activityDraft,
        source: "ai",
        model,
      };
    }

    const memoryDrafts: AssistantMemoryDraft[] = [];
    const assistant = new ToolLoopAgent({
      model,
      instructions: buildTeamAssistantPrompt({ assistantName: organization?.assistant_name, viewerKind: context.viewer.kind, canManageActivities }),
      tools: { ...createTeamAssistantTools(supabase, teamId, activityIds), ...createAssistantMemoryTools(memoryScope, draft => memoryDrafts.push(draft)) },
      maxOutputTokens: 500,
      stopWhen: isStepCount(5),
      providerOptions: { gateway: { user: createHash("sha256").update(userId).digest("hex").slice(0, 24), tags: ["feature:team-assistant"] } },
    });
    const result = await assistant.generate({
      prompt: JSON.stringify({ context, previousMessages: input.messages, question }),
      abortSignal: AbortSignal.timeout(30_000),
    });
    console.info("team_assistant_completed", { teamId, model, latencyMs: Date.now() - startedAt, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens });
    return { answer: result.text || "Jag kunde inte formulera ett svar.", memoryDrafts, source: "ai", model };
  } catch (error) {
    const gatewayError = error as Error & { statusCode?: number; cause?: { name?: string; message?: string } };
    console.warn("team_assistant_fallback", {
      teamId,
      model,
      latencyMs: Date.now() - startedAt,
      error: gatewayError.name || "unknown",
      statusCode: gatewayError.statusCode,
      cause: gatewayError.cause?.name,
      message: gatewayError.message.slice(0, 240),
    });
    if (requiresActivityDraft) {
      throw new TeamAssistantError("draft-unavailable", "Aktivitetsutkastet kunde inte tas fram just nu. Kontrollera AI Gateway och försök igen.");
    }
    const nextActivity = activities?.[0];
    const answer = nextActivity
      ? `Jag kan inte formulera ett AI-svar just nu. Nästa aktivitet är ${nextActivity.title} på ${nextActivity.location || "plats som ännu inte angetts"}.`
      : "Jag kan inte formulera ett AI-svar just nu, och jag hittar ingen kommande aktivitet för laget.";
    return { answer, source: "fallback", model };
  }
}
