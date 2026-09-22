"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TeamSignal } from "@/lib/ai/team-briefing";

type BriefingResponse = {
  briefing: {
    headline: string;
    summary: string;
    items: Array<{ signalId: string; reason: string; signal: TeamSignal }>;
  };
  source: "ai" | "cache" | "fallback";
  model: string;
  usage: { inputTokens?: number; outputTokens?: number };
  latencyMs: number;
  fetchMs?: number;
};

function formatDueAt(value: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Stockholm",
  }).format(new Date(value));
}

export function TeamBriefingCard({ teamId, assistantName, demo }: { teamId: string; assistantName: string; demo: boolean }) {
  const [result, setResult] = useState<BriefingResponse>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const initialLoadStarted = useRef(false);

  const generate = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(undefined);
    const startedAt = performance.now();
    try {
      const response = await fetch(`/api/ai/team-briefing?teamId=${encodeURIComponent(teamId)}`, {
        cache: refresh ? "reload" : "default",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Översikten kunde inte skapas.");
      setResult({ ...body, fetchMs: Math.round(performance.now() - startedAt) });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Översikten kunde inte skapas.");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (demo || initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    void generate();
  }, [demo, generate]);

  return (
    <article className="card assistant-card briefing-card">
      <div className="assistant-header">
        <span className="assistant-avatar">✦</span>
        <div><p className="eyebrow">{assistantName} · AI-prov</p><h2>Dagens lagöversikt</h2></div>
      </div>
      {!result ? <>
        <p>Prioriterar aktiviteter, obesvarade kallelser och uppgifter. Modellen får inga kontaktuppgifter.</p>
        {loading
          ? <p className="briefing-loading" role="status">Prioriterar lagets viktigaste information…</p>
          : <button className="briefing-generate" disabled={demo} onClick={() => void generate()} type="button">
              {demo ? "Kräver databasläge" : error ? "Försök igen" : "Ladda lagöversikt"}
            </button>}
        {error && <p className="briefing-error" role="alert">{error}</p>}
      </> : <>
        <div className="briefing-result">
          <div className="briefing-title"><strong>{result.briefing.headline}</strong><span>{result.source === "ai" ? "AI" : result.source === "cache" ? "Cache" : "Reservläge"}</span></div>
          <p>{result.briefing.summary}</p>
          <ol>{result.briefing.items.map(({ signalId, reason, signal }) => <li key={signalId}><strong>{signal.title}</strong><small>{signal.detail}</small><small>{reason}</small><em>{formatDueAt(signal.dueAt)}</em></li>)}</ol>
        </div>
        <div className="briefing-meta">
          <span>{result.fetchMs ?? result.latencyMs} ms</span>
          <span>{(result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0)} tokens</span>
          <button onClick={() => void generate(true)} disabled={loading} type="button">{loading ? "Uppdaterar…" : "Uppdatera"}</button>
        </div>
      </>}
    </article>
  );
}
