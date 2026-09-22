import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createFallbackBriefing, generateTeamBriefing, type TeamSignal } from "@/lib/ai/team-briefing";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const DEFAULT_MODEL = "google/gemini-2.5-flash-lite";

function safeErrorCode(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") return "timeout";
    if (error.message === "invalid_model_output") return "invalid_output";
  }
  return "gateway_error";
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Du behöver vara inloggad." }, { status: 401 });

  const body = await request.json().catch(() => null) as { teamId?: unknown } | null;
  if (!body || typeof body.teamId !== "string") {
    return NextResponse.json({ error: "Lag saknas." }, { status: 400 });
  }

  const { data: canManage, error: accessError } = await supabase.rpc("can_manage_team", { target_team_id: body.teamId });
  if (accessError || !canManage) {
    return NextResponse.json({ error: "Du saknar behörighet att skapa lagöversikten." }, { status: 403 });
  }

  const { data: team } = await supabase
    .from("teams")
    .select("id, organization_id")
    .eq("id", body.teamId)
    .maybeSingle();
  if (!team) return NextResponse.json({ error: "Laget hittades inte." }, { status: 404 });

  const now = new Date().toISOString();
  const [{ data: activity }, { data: tasks }] = await Promise.all([
    supabase
      .from("activities")
      .select("id, title, starts_at")
      .eq("team_id", team.id)
      .gte("ends_at", now)
      .order("starts_at")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("team_tasks")
      .select("id, title, due_at")
      .eq("team_id", team.id)
      .eq("status", "open")
      .order("due_at")
      .limit(8),
  ]);

  const { count: pendingInvitations } = activity
    ? await supabase
        .from("invitations")
        .select("id", { count: "exact", head: true })
        .eq("activity_id", activity.id)
        .eq("response", "pending")
    : { count: 0 };

  const signals: TeamSignal[] = [];
  if (activity) {
    signals.push({
      id: `activity:${activity.id}`,
      kind: "activity",
      title: activity.title,
      detail: "Nästa aktivitet för laget",
      dueAt: activity.starts_at,
      importance: "normal",
    });
    if ((pendingInvitations ?? 0) > 0) {
      signals.push({
        id: `invitations:${activity.id}`,
        kind: "invitation",
        title: `${pendingInvitations} obesvarade kallelser`,
        detail: `Behöver följas upp före ${activity.title}`,
        dueAt: activity.starts_at,
        importance: "high",
      });
    }
  }
  for (const task of tasks ?? []) {
    signals.push({
      id: `task:${task.id}`,
      kind: "task",
      title: task.title,
      detail: "Öppen uppgift från kansliet",
      dueAt: task.due_at,
      importance: "high",
    });
  }

  const model = process.env.AI_FEED_MODEL?.trim() || DEFAULT_MODEL;
  let source: "ai" | "fallback" = "fallback";
  let briefing = createFallbackBriefing(signals);
  let usage: { inputTokens?: number; outputTokens?: number } = {};
  let errorCode: string | null = null;

  if (process.env.AI_ENABLED !== "false" && signals.length > 0) {
    try {
      const generated = await generateTeamBriefing({
        signals,
        model,
        userReference: createHash("sha256").update(authData.user.id).digest("hex").slice(0, 24),
      });
      briefing = generated.briefing;
      usage = generated.usage;
      source = "ai";
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
    requested_by: authData.user.id,
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
  });
}
