"use client";

import { FormEvent, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

export function TeamAssistantCard({ teamId, teamName, assistantName, demo }: { teamId: string; teamName: string; assistantName: string; demo: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending || demo) return;
    const previous = messages;
    setMessages([...previous, { role: "user", content: trimmed }]);
    setQuestion("");
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch("/api/ai/team-assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId, question: trimmed, messages: previous, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Assistenten kunde inte svara.");
      setMessages((current) => [...current, { role: "assistant", content: body.answer }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Assistenten kunde inte svara.");
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <article className="card assistant-card team-chat-card">
      <div className="assistant-header"><span className="assistant-avatar">✦</span><div><p className="eyebrow">{assistantName} · {teamName}</p><h2>Lagassistent</h2></div></div>
      {messages.length === 0 ? <>
        <p>Fråga om nästa aktivitet, samling, vilka som kommer eller praktiska instruktioner.</p>
        <button className="prompt" disabled={demo} onClick={() => void ask("Vad händer härnäst för mig?")} type="button">Vad händer härnäst för mig?</button>
        <button className="prompt" disabled={demo} onClick={() => void ask("Vilka kompisar kommer på nästa aktivitet?")} type="button">Vilka kompisar kommer nästa gång?</button>
      </> : <div className="assistant-messages" aria-live="polite">{messages.map((message, index) => <div className={`assistant-message ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === "assistant" ? assistantName : "Du"}</span><p>{message.content}</p></div>)}</div>}
      {pending ? <p className="assistant-thinking" role="status">{assistantName} tänker…</p> : null}
      {error ? <p className="briefing-error" role="alert">{error}</p> : null}
      <form className="assistant-input" onSubmit={submit}><label className="sr-only" htmlFor={`assistant-${teamId}`}>Fråga {assistantName}</label><input id={`assistant-${teamId}`} maxLength={500} onChange={(event) => setQuestion(event.target.value)} placeholder={demo ? "Kräver databasläge" : `Fråga ${assistantName}…`} value={question} disabled={demo || pending} /><button type="submit" aria-label="Skicka" disabled={demo || pending || !question.trim()}>↑</button></form>
      <small className="assistant-disclaimer">AI kan ha fel. Kontrollera viktiga tider i aktiviteten.</small>
    </article>
  );
}
