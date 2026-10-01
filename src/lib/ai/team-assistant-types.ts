import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import type { ActivityDraft } from "./activity-draft";

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type AssistantViewerKind = "leader" | "player-or-guardian";
export type TeamAssistantInput = {
  teamId: string;
  question: string;
  messages: ChatMessage[];
  timeZone?: unknown;
};
export type AssistantDependencies = { supabase: SupabaseClient<Database>; userId: string };
export type TeamAssistantReply = {
  answer: string;
  activityDraft?: ActivityDraft;
  source: "ai" | "fallback";
  model: string;
};

export class TeamAssistantError extends Error {
  constructor(public readonly code: "team-not-found" | "team-forbidden" | "draft-unavailable", message: string) {
    super(message);
    this.name = "TeamAssistantError";
  }
}
