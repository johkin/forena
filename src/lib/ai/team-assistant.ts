import { createActivityHistoryTools } from "./activity-history-tools";
import { historyPeriodFromQuestion } from "./activity-history-period";
import { containsToolCode, hasHistoryPeriod, isActivityHistoryQuestion } from "./activity-history-intent";
import { resolveDraftActivityType } from "./activity-draft-type";
import type { ActivityHistoryResult } from "./activity-history-result";
import { createHash } from "node:crypto";
import { generateText, gateway, isStepCount, Output, ToolLoopAgent } from "ai";
import { activityDraftNeedsWebResearch, isActivityDraftRequest, normalizeActivityDraft, requiresWeeklyRecurrence, searchSourcesFromToolResults, type ActivityDraft } from "./activity-draft";
import { activityDraftSchema } from "./activity-draft-schema";
import { loadTeamAssistantContext } from "./team-assistant-context";
import { buildActivityDraftPrompt, buildEventResearchPrompt, buildTeamAssistantPrompt } from "./team-assistant-prompts";
import { createTeamAssistantTools } from "./team-assistant-tools";
import { createAssistantMemoryTools } from "./assistant-memory-tools";
import type { AssistantMemoryDraft } from "./assistant-memory-draft";
import { createReminderTools } from "./reminder-tools";
import type { ReminderDraft } from "./reminder-draft";
import { TeamAssistantError, type AssistantDependencies, type TeamAssistantInput, type TeamAssistantReply } from "./team-assistant-types";

// Keep the model already exercised by the production team briefing.
const DEFAULT_MODEL = "google/gemini-2.5-flash-lite";

export async function answerTeamAssistant(input: TeamAssistantInput, dependencies: AssistantDependencies): Promise<TeamAssistantReply> {
  const startedAt = Date.now();
  const { teamId, question } = input;
  const { supabase, userId } = dependencies;
  const { organization, activities, activityIds, canManageActivities, canManageInvitations, memoryScope, context, organizationToday } = await loadTeamAssistantContext(input, dependencies);
  const model = process.env.AI_ASSISTANT_MODEL?.trim() || process.env.AI_FEED_MODEL?.trim() || DEFAULT_MODEL;
  const requiresActivityDraft = Boolean(canManageActivities) && isActivityDraftRequest(question);
  const requiresWebResearch = requiresActivityDraft && activityDraftNeedsWebResearch(question);
  const requiresHistory = context.viewer.kind === "leader" && isActivityHistoryQuestion(question);

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

      let normalized = normalizeActivityDraft(draftResult.output);
      if (requiresWeeklyRecurrence(question) && !normalized.recurrence) throw new Error("En återkommande begäran måste ge ett serieutkast.");
      const skipsPastDates = normalized.startsOn < organizationToday && Boolean(normalized.recurrence);
      if (skipsPastDates && normalized.recurrence && (!normalized.recurrence.endsOn || normalized.recurrence.endsOn >= organizationToday)) {
        normalized = normalizeActivityDraft({ ...normalized, startsOn: organizationToday });
      }
      const activityTypeId = resolveDraftActivityType(normalized, question, context.activityTypes);
      if (normalized.startsOn < organizationToday) throw new Error("Aktivitetsdatumet har redan passerat. Sök efter nästa kommande upplaga.");
      const activityDraft: ActivityDraft = { ...normalized, ...(activityTypeId ? { activityTypeId } : {}), sources: searchSourcesFromToolResults(researchToolResults) };
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
          ? `Jag har öppnat ett utkast till en aktivitetsserie som du kan granska och justera innan den sparas.${skipsPastDates ? " Passerade datum hoppas över." : ""}${normalized.recurrence.endsOn === null ? " Fyll i slutdatum för serien innan du förhandsgranskar." : ""}`
          : "Jag har öppnat ett aktivitetsutkast som du kan granska och justera innan det sparas.",
        activityDraft,
        source: "ai",
        model,
      };
    }

    const memoryDrafts: AssistantMemoryDraft[] = [];
    const reminderDrafts: ReminderDraft[] = [];
    const historyResults: ActivityHistoryResult[] = [];
    const historyPeriod = historyPeriodFromQuestion(question, organizationToday);
    const assistant = new ToolLoopAgent({
      model,
      instructions: buildTeamAssistantPrompt({ assistantName: organization?.assistant_name, viewerKind: context.viewer.kind, canManageActivities, canManageInvitations }),
      tools: {
        ...createTeamAssistantTools(supabase, teamId, activityIds),
        ...(context.viewer.kind === "leader" ? createActivityHistoryTools(supabase, memoryScope.organizationId, teamId, { today: organizationToday, period: historyPeriod, onResult: result => historyResults.push(result) }) : {}),
        ...createAssistantMemoryTools(memoryScope, draft => memoryDrafts.push(draft)),
        ...(canManageInvitations ? createReminderTools({ supabase, teamId, activityIds,
          timeZone: context.clock.organizationTimeZone,
          memories: context.memories.filter(memory => memory.scope !== "personal").map(memory => ({ scope: memory.scope, subject: memory.subject, content: memory.content, disciplineId: memory.disciplineId })),
          onDraft: draft => {
            const index = reminderDrafts.findIndex(item => item.assessment.activityId === draft.assessment.activityId);
            if (index >= 0) reminderDrafts[index] = draft;
            else reminderDrafts.push(draft);
          },
        }) : {}),
      },
      maxOutputTokens: 500,
      stopWhen: isStepCount(5),
      prepareStep: ({ stepNumber }) => {
        if (!requiresHistory) return;
        // Require native tool calls; prose resembling a tool call cannot fetch data.
        if (stepNumber === 0) return { activeTools: ["listHistoryTeams"], toolChoice: { type: "tool", toolName: "listHistoryTeams" } };
        if (stepNumber === 1 && (historyPeriod || hasHistoryPeriod(question))) {
          return { activeTools: ["readActivityHistory"], toolChoice: { type: "tool", toolName: "readActivityHistory" } };
        }
        // History is data for this answer and must never become a memory proposal.
        return { activeTools: ["listHistoryTeams", "readActivityHistory"] };
      },
      providerOptions: { gateway: { user: createHash("sha256").update(userId).digest("hex").slice(0, 24), tags: ["feature:team-assistant"] } },
    });
    const result = await assistant.generate({
      prompt: JSON.stringify({ context: { ...context, historyPeriod }, previousMessages: input.messages, question }),
      abortSignal: AbortSignal.timeout(30_000),
    });
    console.info("team_assistant_completed", { teamId, model, latencyMs: Date.now() - startedAt, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
      mode: requiresHistory ? "activity-history" : "chat", historyResultCount: historyResults.length,
      tools: result.steps?.flatMap(step => step.toolCalls.flatMap(call => call ? [call.toolName] : [])) ?? [],
    });
    if (requiresHistory && (historyPeriod || hasHistoryPeriod(question)) && !historyResults.length) {
      const failedRead = result.steps?.flatMap(step => step.toolResults).find(item => item?.toolName === "readActivityHistory");
      const output = failedRead?.output;
      const error = output && typeof output === "object" && "error" in output && typeof output.error === "string" ? output.error : undefined;
      return { answer: error ?? "Historiken kunde inte verifieras. Försök igen. Det betyder inte att registrerad närvaro saknas.", historyResults: [], source: "fallback", model };
    }
    const invalidAnswer = !result.text || containsToolCode(result.text);
    const answer = invalidAnswer && historyResults.length
      ? historyResults.map(history => `${history.team}, ${history.from}–${history.through}: ${history.summary.uniquePeople} unika personer och ${history.summary.participationCount} registrerade deltagartillfällen.${history.unreportedActivityCount ? ` ${history.unreportedActivityCount} aktiviteter saknar närvarorapport.` : ""}`).join("\n")
      : invalidAnswer ? "Jag kunde inte hämta ett verifierat svar. Försök igen och ange vilken period som avses om den saknas." : result.text;
    return { answer, memoryDrafts, reminderDrafts, historyResults, source: invalidAnswer && !historyResults.length ? "fallback" : "ai", model };
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
    if (requiresHistory) return { answer: "Historiken kunde inte hämtas just nu. Det betyder inte att registrerad närvaro saknas. Försök igen.", source: "fallback", model };
    const nextActivity = activities?.[0];
    const answer = nextActivity
      ? `Jag kan inte formulera ett AI-svar just nu. Nästa aktivitet är ${nextActivity.title} på ${nextActivity.location || "plats som ännu inte angetts"}.`
      : "Jag kan inte formulera ett AI-svar just nu, och jag hittar ingen kommande aktivitet för laget.";
    return { answer, source: "fallback", model };
  }
}
