"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Activity } from "@/domain/club";
import type { TeamSignal } from "@/lib/capability-signals";

type Props = { signals: TeamSignal[]; activities: Activity[]; timeZone: string; onOpenActivity: (activity: Activity) => void };

export function CapabilitySignalList({ signals, activities, timeZone, onOpenActivity }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<{ id: string; action: "dismiss" | "remind-unanswered" }>();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [reminded, setReminded] = useState<string[]>([]);
  const stamp = (signal: TeamSignal) => `${signal.id}:${signal.revision}`;
  const format = (value: string) => new Intl.DateTimeFormat("sv-SE", {
    timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));

  async function execute(signal: TeamSignal, action: "dismiss" | "remind-unanswered") {
    setPending(true);
    setNotice(undefined);
    try {
      const response = await fetch(`/api/signals/${signal.id}`, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, revision: signal.revision }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Åtgärden kunde inte utföras.");
      if (action === "dismiss") {
        setDismissed(current => [...current, stamp(signal)]);
        setNotice("Uppgiften har avfärdats för laget.");
      } else {
        if (result.queuedRecipients > 0) setReminded(current => [...current, stamp(signal)]);
        setNotice(result.queuedRecipients > 0 ? `Påminnelsen köades till ${result.queuedRecipients} mottagare.`
          : "Det finns inga nåbara mottagare för de obesvarade kallelserna.");
      }
      setConfirming(undefined);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Åtgärden kunde inte utföras.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return <div className="capability-signal-list">
    {notice ? <p role="status">{notice}</p> : null}
    {signals.filter(signal => !dismissed.includes(stamp(signal))).map(signal => {
      const activity = activities.find(item => item.id === signal.activityId);
      const confirmation = confirming?.id === signal.id ? confirming.action : undefined;
      return <article className="capability-signal" data-severity={signal.severity} key={signal.id}>
        <strong>{signal.title}</strong>
        {activity ? <button className="signal-activity-link" type="button" onClick={() => onOpenActivity(activity)}>
          {activity.title} · {format(activity.startsAt)}
        </button> : <a href={`/activities/${signal.activityId}`}>Öppna aktiviteten</a>}
        <p>{signal.text}</p>
        {signal.lastAction ? <small>{signal.lastAction.id === "remind-unanswered" ? "Påminnelse köad"
          : signal.lastAction.id === "invite-more-players" ? "Fler spelare kallade" : "Åtgärd utförd"} · {format(signal.lastAction.createdAt)}</small> : null}
        {reminded.includes(stamp(signal)) ? <small>Påminnelse köad. Uppgiften ligger kvar tills problemet är löst.</small> : null}
        <div className="signal-actions">
          {signal.actions.map(action => action.id === "invite-more-players"
            ? activity ? <button className="secondary" key={action.id} onClick={() => onOpenActivity(activity)} type="button">{action.label}</button>
              : <a key={action.id} href={`/activities/${signal.activityId}`}>{action.label}</a>
            : !reminded.includes(stamp(signal)) ? <button className="secondary" disabled={pending} key={action.id} type="button"
              onClick={() => { setNotice(undefined); setConfirming({ id: signal.id, action: "remind-unanswered" }); }}>{action.label}</button> : null)}
          <button className="secondary" disabled={pending} type="button" onClick={() => { setNotice(undefined); setConfirming({ id: signal.id, action: "dismiss" }); }}>Avfärda</button>
        </div>
        {confirmation ? <div className="signal-confirmation">
          <p>{confirmation === "dismiss" ? "Dölj uppgiften för alla ledare i laget. Om problemet först löses och sedan återkommer visas det igen."
            : "Skicka en påminnelse till de obesvarade kallelsernas nåbara mottagare. Uppgiften ligger kvar tills problemet är löst."}</p>
          <div className="signal-actions">
            <button className="primary" disabled={pending} type="button" onClick={() => void execute(signal, confirmation)}>{pending ? "Arbetar…" : confirmation === "dismiss" ? "Avfärda för laget" : "Skicka påminnelse"}</button>
            <button className="secondary" disabled={pending} type="button" onClick={() => setConfirming(undefined)}>Avbryt</button>
          </div>
        </div> : null}
      </article>;
    })}
  </div>;
}
