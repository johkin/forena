import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createFallbackBriefing, generateTeamBriefing, validateTeamBriefing, type TeamSignal } from "@/lib/ai/team-briefing";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const DEFAULT_MODEL = "google/gemini-2.5-flash-lite";
const PRIVATE_CACHE_HEADERS = {
  "Cache-Control": "private, max-age=300",
  Vary: "Cookie",
};

type BriefingContext = {
  teamId: string;
  organizationId: string;
  activity: { id: string; title: string; dueAt: string; pendingInvitations: number; acceptedInvitations: number; declinedInvitations: number; responseComments: string[] } | null;
  tasks: { id: string; title: string; dueAt: string }[];
  instructions: { id: string; title: string; dueAt: string; documentTitle: string; summary: string }[];
};

function isBriefingContext(value: Json): value is BriefingContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return typeof value.teamId === "string"
    && typeof value.organizationId === "string"
    && Array.isArray(value.tasks)
    && Array.isArray(value.instructions);
}

function safeErrorCode(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") return "timeout";
    if (error.message === "invalid_model_output") return "invalid_output";
  }
  return "gateway_error";
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();
  const userId = authData?.claims.sub;
  if (authError || typeof userId !== "string") {
    return NextResponse.json({ error: "Du behöver vara inloggad." }, { status: 401 });
  }

  const teamId = new URL(request.url).searchParams.get("teamId");
  if (!teamId) {
    return NextResponse.json({ error: "Lag saknas." }, { status: 400 });
  }

  const { data: contextData, error: contextError } = await supabase.rpc("get_team_briefing_context", {
    target_team_id: teamId,
  });
  if (contextError || !contextData || !isBriefingContext(contextData)) {
    return NextResponse.json({ error: "Du saknar behörighet att skapa lagöversikten." }, { status: 403 });
  }
  const team = { id: contextData.teamId, organization_id: contextData.organizationId };
  const activity = contextData.activity;
  const tasks = contextData.tasks;

  const signals: TeamSignal[] = [];
  if (activity) {
    signals.push({
      id: `activity:${activity.id}`,
      kind: "activity",
      title: activity.title,
      detail: "Nästa aktivitet för laget",
      dueAt: activity.dueAt,
      importance: "normal",
    });
    if (activity.pendingInvitations > 0) {
      signals.push({
        id: `invitations:${activity.id}`,
        kind: "invitation",
        title: `${activity.pendingInvitations} obesvarade kallelser`,
        detail: `${activity.acceptedInvitations} kommer, ${activity.declinedInvitations} kan inte, ${activity.pendingInvitations} har inte svarat.${activity.responseComments.length ? ` Kommentarer: ${activity.responseComments.slice(0, 4).join(" | ")}` : ""}`,
        dueAt: activity.dueAt,
        importance: "high",
      });
    }
  }
  for (const task of tasks) {
    signals.push({
      id: `task:${task.id}`,
      kind: "task",
      title: task.title,
      detail: "Öppen uppgift från kansliet",
      dueAt: task.dueAt,
      importance: "high",
    });
  }
  for (const instruction of contextData.instructions) {
    signals.push({
      id: `instruction:${instruction.id}`,
      kind: "instruction",
      title: instruction.title,
      detail: `${instruction.documentTitle}: ${instruction.summary}`,
      dueAt: instruction.dueAt,
      importance: "high",
    });
  }

  const model = process.env.AI_FEED_MODEL?.trim() || DEFAULT_MODEL;
  const signalHash = createHash("sha256").update(JSON.stringify({ model, signals })).digest("hex");
  const signalIds = new Set(signals.map((signal) => signal.id));
  const { data: cached } = await supabase
    .from("ai_team_briefing_cache")
    .select("briefing, model")
    .eq("team_id", team.id)
    .eq("signal_hash", signalHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  const cachedBriefing = cached ? validateTeamBriefing(cached.briefing, signalIds) : null;
  if (cachedBriefing && cached) {
    const latencyMs = Date.now() - startedAt;
    console.info("team_briefing_cache_hit", { teamId: team.id, model: cached.model, latencyMs, signalCount: signals.length });
    const signalById = new Map(signals.map((signal) => [signal.id, signal]));
    return NextResponse.json({
      briefing: {
        ...cachedBriefing,
        items: cachedBriefing.items.flatMap((item) => {
          const signal = signalById.get(item.signalId);
          return signal ? [{ ...item, signal }] : [];
        }),
      },
      source: "cache",
      model: cached.model,
      usage: {},
      latencyMs,
    }, { headers: PRIVATE_CACHE_HEADERS });
  }

  let source: "ai" | "fallback" = "fallback";
  let briefing = createFallbackBriefing(signals);
  let usage: { inputTokens?: number; outputTokens?: number } = {};
  let errorCode: string | null = null;

  if (process.env.AI_ENABLED !== "false" && signals.length > 0) {
    try {
      const generated = await generateTeamBriefing({
        signals,
        model,
        userReference: createHash("sha256").update(userId).digest("hex").slice(0, 24),
      });
      briefing = generated.briefing;
      usage = generated.usage;
      source = "ai";

      const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
      const { error: cacheError } = await supabase.from("ai_team_briefing_cache").upsert({
        team_id: team.id,
        organization_id: team.organization_id,
        signal_hash: signalHash,
        briefing: briefing as unknown as Json,
        model,
        input_tokens: usage.inputTokens ?? null,
        output_tokens: usage.outputTokens ?? null,
        generated_at: new Date().toISOString(),
        expires_at: expiresAt,
      });
      if (cacheError) console.warn("team_briefing_cache_write_failed", { teamId: team.id, code: cacheError.code });
    } catch (error) {
      errorCode = safeErrorCode(error);
      console.warn("team_briefing_fallback", { teamId: team.id, model, errorCode });
    }
  } else if (process.env.AI_ENABLED === "false") {
    errorCode = "disabled";
  }

  const latencyMs = Date.now() - startedAt;
  const { error: logError } = await supabase.from("ai_generation_runs").insert({
    organization_id: team.organization_id,
    team_id: team.id,
    requested_by: userId,
    feature: "team_briefing",
    model,
    status: source === "ai" ? "success" : "fallback",
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    latency_ms: latencyMs,
    signal_count: signals.length,
    error_code: errorCode,
  });
  if (logError) console.warn("team_briefing_usage_log_failed", { teamId: team.id, code: logError.code });
  console.info("team_briefing_completed", {
    teamId: team.id,
    source,
    model,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    latencyMs,
    signalCount: signals.length,
  });

  const signalById = new Map(signals.map((signal) => [signal.id, signal]));
  return NextResponse.json({
    briefing: {
      ...briefing,
      items: briefing.items.flatMap((item) => {
        const signal = signalById.get(item.signalId);
        return signal ? [{ ...item, signal }] : [];
      }),
    },
    source,
    model,
    usage,
    latencyMs,
  }, { headers: PRIVATE_CACHE_HEADERS });
}
