"use client";

import { AssistantHistoryCard } from "./assistant-history-card";
import type { ActivityHistoryResult } from "@/lib/ai/activity-history-result";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { ActivityDraft } from "@/lib/ai/activity-draft";
import type { AssistantMemoryDraft } from "@/lib/ai/assistant-memory-draft";
import { AssistantMemoryDraftCard } from "./assistant-memory-draft-card";
import { AssistantReminderDraftCard } from "./assistant-reminder-draft-card";
import type { ReminderDraft } from "@/lib/ai/reminder-draft";

type Message = { role: "user" | "assistant"; content: string; memoryDrafts?: AssistantMemoryDraft[]; reminderDrafts?: ReminderDraft[]; historyResults?: ActivityHistoryResult[] };
type Props = {
  teamId?: string;
  organizationId?: string;
  sectionSlug?: string;
  page?: { path: string; title: string };
  floating?: boolean;
  onReply?: () => void;
  onOpenActivity?: () => void;
  teamName: string;
  assistantName: string;
  demo: boolean;
  canCreateActivity: boolean;
  onActivityDraft: (draft: ActivityDraft, context?: import("./floating-assistant").AssistantDraftContext) => void;
};

export function TeamAssistantCard({ teamId, teamName, assistantName, demo, canCreateActivity, onActivityDraft, organizationId, sectionSlug, page, floating, onReply, onOpenActivity }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const thread = useRef<HTMLDivElement>(null);
  const active = useRef(true);
  const requestController = useRef<AbortController | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; requestController.current?.abort(); }; }, []);
  useEffect(() => { if (thread.current) thread.current.scrollTop = thread.current.scrollHeight; }, [messages, pending]);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending || demo) return;
    const previous = messages;
    setMessages([...previous, { role: "user", content: trimmed }]);
    setQuestion("");
    setPending(true);
    setError(undefined);
    try {
      requestController.current = new AbortController();
      const response = await fetch(organizationId ? "/api/ai/workspace-assistant" : "/api/ai/team-assistant", {
        signal: requestController.current.signal,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId, sectionSlug, teamId, page, question: trimmed, messages: previous.slice(-6).map(({ role, content }) => ({ role, content: content.slice(0, 800) })), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      const body = await response.json();
      if (!active.current) return;
      if (!response.ok) throw new Error(body.error ?? "Assistenten kunde inte svara.");
      setMessages((current) => [...current, { role: "assistant", content: body.answer, memoryDrafts: body.memoryDrafts, reminderDrafts: body.reminderDrafts, historyResults: body.historyResults }]);
      onReply?.();
      if (body.activityDraft) onActivityDraft(body.activityDraft as ActivityDraft, body.draftContext);
    } catch (caught) {
      if (!active.current) return;
      setError(caught instanceof Error ? caught.message : "Assistenten kunde inte svara.");
    } finally {
      if (active.current) setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <article className={`card assistant-card team-chat-card${floating ? " floating-assistant-chat" : ""}`}>
      {!floating ? <div className="assistant-header"><span className="assistant-avatar">✦</span><div><p className="eyebrow">{assistantName} · {teamName}</p><h2>Lagassistent</h2></div></div> : null}
      <div ref={thread} className="assistant-conversation">{messages.length === 0 ? <>
        <p>{teamId ? "Fråga om nästa aktivitet, samling, vilka som kommer eller praktiska instruktioner." : "Fråga om klubbens eller sektionens aktiviteter. Ange lagets namn för lagfrågor och aktivitetsutkast."}</p>
        <button className="prompt" disabled={demo} onClick={() => void ask(teamId ? "Vad händer härnäst för mig?" : "Vilka aktiviteter är på gång?")} type="button">{teamId ? "Vad händer härnäst för mig?" : "Vilka aktiviteter är på gång?"}</button>
        {teamId ? <button className="prompt" disabled={demo} onClick={() => void ask("Vilka kompisar kommer på nästa aktivitet?")} type="button">Vilka kompisar kommer nästa gång?</button> : null}
        {canCreateActivity ? <button className="prompt" disabled={demo} onClick={() => void ask("Skapa en intresseanmälan för att vara med på Aroscupen")} type="button">Skapa en intresseanmälan till Aroscupen</button> : null}
      </> : <div className="assistant-messages" aria-live="polite">{messages.map((message, index) => <div className={`assistant-message ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === "assistant" ? assistantName : "Du"}</span>{!message.historyResults?.length ? <p>{message.content}</p> : null}{message.historyResults?.map((result, index) => <AssistantHistoryCard key={`${result.team}-${result.from}-${result.through}-${index}`} result={result} onOpenActivity={onOpenActivity} answer={index === 0 ? message.content : undefined} />)}{message.memoryDrafts?.map(draft => <AssistantMemoryDraftCard key={draft.id} draft={draft} />)}{message.reminderDrafts?.map(draft => <AssistantReminderDraftCard key={draft.assessment.activityId} draft={draft} />)}</div>)}</div>}
      {pending ? <p className="assistant-thinking" role="status">{assistantName} tänker…</p> : null}
      {error ? <p className="briefing-error" role="alert">{error}</p> : null}
      </div><form className="assistant-input" onSubmit={submit}><label className="sr-only" htmlFor={`assistant-${teamId}`}>Fråga {assistantName}</label><input id={`assistant-${teamId}`} maxLength={500} onChange={(event) => setQuestion(event.target.value)} placeholder={demo ? "Kräver databasläge" : `Fråga ${assistantName}…`} value={question} disabled={demo || pending} /><button type="submit" aria-label="Skicka" disabled={demo || pending || !question.trim()}>↑</button></form>
      <small className="assistant-disclaimer">AI kan ha fel. Kontrollera viktiga tider i aktiviteten.</small>
    </article>
  );
}

