"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import type { NavigationLink } from "./navigation-link";
import type { ParticipationFetch } from "./activity-invitation-response";
import { ExtensionFields } from "./extension-fields";

const schema = z.array(
  z.object({
    id: z.uuid(),
    activityId: z.uuid(),
    state: z.enum(["active", "dismissed", "resolved"]),
    severity: z.string(),
    title: z.string(),
    text: z.string(),
    actions: z.array(z.string()),
    revision: z.number(),
    episode: z.number(),
    evaluatedAt: z.string(),
    history: z.array(
      z.object({
        action: z.string(),
        result: z.string(),
        createdAt: z.string(),
      }),
    ),
  }),
);
export function TeamCapabilitySignals({
  teamId,
  request,
  teamName,
  activeOnly = false,
  refreshKey,
  linkComponent: Link = "a",
}: {
  teamId: string;
  request: ParticipationFetch;
  teamName?: string;
  activeOnly?: boolean;
  refreshKey?: string;
  linkComponent?: NavigationLink;
}) {
  const [data, setData] = useState<z.infer<typeof schema>>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [confirm, setConfirm] = useState<{
    id: string;
    revision: number;
    action: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    request(`/api/teams/${teamId}/signals`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 403) {
          if (!controller.signal.aborted) { setData([]); setError(undefined); }
          return;
        }
        if (!response.ok) throw new Error();
        const snapshot = schema.parse(await response.json());
        if (!controller.signal.aborted) {
          setData(snapshot);
          setError(undefined);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Lagets signaler kunde inte hämtas.");
      });
    return () => controller.abort();
  }, [request, teamId, attempt, refreshKey]);
  async function perform() {
    if (!confirm || busy) return;
    setBusy(true);
    setNotice(undefined);
    try {
      const response = await request(`/api/signals/${confirm.id}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          revision: confirm.revision,
          action: confirm.action,
        }),
      });
      if (!response.ok) throw new Error();
      setNotice(confirm.action === "dismiss" ? "Avfärdad för laget." : "Påminnelse köad för leverans.");
      setConfirm(undefined);
      setAttempt((n) => n + 1);
    } catch {
      setError(
        "Åtgärden kunde inte genomföras. Läs in aktuella uppgifter och försök igen.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!error && !data?.length) return null;
  const active = data?.filter((item) => item.state === "active") ?? [];
  const history = data?.filter((item) => item.state !== "active") ?? [];
  if (activeOnly && !error && !notice && !active.length) return null;
  function signal(item: z.infer<typeof schema>[number]) {
    return (
      <article className="settings-item" key={item.id}>
        <h3>{item.title}</h3>
        <p>{item.text}</p>
        <p>
          {item.state === "dismissed"
            ? "Avfärdad för laget"
            : item.state === "resolved"
              ? "Löst"
              : "Behöver hanteras"}
        </p>
        <Link href={`/activities/${item.activityId}`}>
          Öppna matchen{item.state === "active" ? " och hantera kallelser" : ""}
        </Link>
        {item.state === "active" ? (
          <div className="form-actions">
            {item.actions.includes("remind-unanswered") ? (
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setConfirm({
                    id: item.id,
                    revision: item.revision,
                    action: "remind-unanswered",
                  })
                }
              >
                Påminn obesvarade
              </button>
            ) : null}
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setConfirm({
                  id: item.id,
                  revision: item.revision,
                  action: "dismiss",
                })
              }
            >
              Avfärda för laget
            </button>
          </div>
        ) : null}
        {item.history.length ? (
          <details>
            <summary>Åtgärdshistorik</summary>
            <ul>
              {item.history.map((entry, index) => (
                <li key={index}>
                  {new Date(entry.createdAt).toLocaleString("sv-SE")} ·{" "}
                  {entry.action === "dismiss"
                    ? "Avfärdad för laget"
                    : entry.action === "invite-more-players"
                      ? "Fler spelare kallade"
                      : "Påminnelse köad för leverans"}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </article>
    );
  }
  return (
    <section className="card">
      <h2>{teamName ? `För laget · ${teamName}` : "För laget"}</h2>
      {notice ? <p role="status">{notice}</p> : null}
      {error ? (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            Läs in igen
          </button>
        </p>
      ) : null}
      {active.map(signal)}
      {confirm ? (
        <div className="settings-item" role="group" aria-label="Granska åtgärd">
          <p>
            {confirm.action === "dismiss"
              ? "Avfärda signalen för hela laget? Den visas igen om problemet först löses och sedan återkommer."
              : "Köa en påminnelse till de kallade som ännu inte har svarat?"}
          </p>
          <button
            className="primary"
            type="button"
            disabled={busy}
            onClick={() => void perform()}
          >
            Bekräfta
          </button>
          <button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={() => setConfirm(undefined)}
          >
            Avbryt
          </button>
        </div>
      ) : null}
      {!activeOnly && history.length ? (
        <details>
          <summary>Tidigare signaler</summary>
          {history.map(signal)}
        </details>
      ) : null}
    </section>
  );
}
const playerSchema = z.array(z.object({ id: z.uuid(), name: z.string() }));
export function TeamDisciplinePlayers({
  teamId,
  request,
}: {
  teamId: string;
  request: ParticipationFetch;
}) {
  const [players, setPlayers] = useState<z.infer<typeof playerSchema>>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    request(`/api/teams/${teamId}/discipline-players`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 403) throw new Error("denied");
        if (!response.ok) throw new Error();
        const data = playerSchema.parse(await response.json());
        if (!controller.signal.aborted) setPlayers(data);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Spelaruppgifterna kunde inte hämtas.");
      });
    return () => controller.abort();
  }, [teamId, request]);
  if (!error && !players) return <p role="status">Hämtar spelaruppgifter…</p>;
  if (!error && !players?.length) return <p>Inga spelare i laget.</p>;
  return (
    <section className="card">
      <h2>Lagets spelaruppgifter</h2>
      {error ? <p role="alert">{error}</p> : null}
      {players?.map((player) => (
        <Player
          key={player.id}
          player={player}
          teamId={teamId}
          request={request}
        />
      ))}
    </section>
  );
}
function Player({
  player,
  teamId,
  request,
}: {
  player: { id: string; name: string };
  teamId: string;
  request: ParticipationFetch;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{player.name}</summary>
      {open ? (
        <ExtensionFields
          teamId={teamId}
          personId={player.id}
          scope="teamMembership"
          request={request}
        />
      ) : null}
    </details>
  );
}
