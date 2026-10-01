import { NextResponse } from "next/server";
import { withAuthenticatedRoute } from "@/lib/http/authenticated-route";
import { answerTeamAssistant } from "@/lib/ai/team-assistant";
import { TeamAssistantError, type ChatMessage } from "@/lib/ai/team-assistant-types";

export const runtime = "nodejs";
export const maxDuration = 45;

function validMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-6).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<ChatMessage>;
    if ((candidate.role !== "user" && candidate.role !== "assistant") || typeof candidate.content !== "string") return [];
    const content = candidate.content.trim().slice(0, 800);
    return content ? [{ role: candidate.role, content }] : [];
  });
}

export const POST = withAuthenticatedRoute(async (request, authentication) => {
  const body = await request.json().catch(() => null) as { teamId?: unknown; question?: unknown; messages?: unknown; timeZone?: unknown } | null;
  const teamId = typeof body?.teamId === "string" ? body.teamId : "";
  const question = typeof body?.question === "string" ? body.question.trim().slice(0, 500) : "";
  if (!teamId || !question) return NextResponse.json({ error: "Skriv en fråga först." }, { status: 400 });

  try {
    const result = await answerTeamAssistant({ teamId, question, messages: validMessages(body?.messages), timeZone: body?.timeZone }, authentication);
    return NextResponse.json(result);
  } catch (error) {
    if (!(error instanceof TeamAssistantError)) throw error;
    const status = { "team-not-found": 404, "team-forbidden": 403, "draft-unavailable": 502 }[error.code];
    return NextResponse.json({ error: error.message }, { status });
  }
});
