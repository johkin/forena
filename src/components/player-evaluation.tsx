"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { ParticipationFetch } from "./activity-invitation-response";
import { ExtensionReadViews } from "./extension-read-views";

const metricSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(["ability", "development"]),
});
export const evaluationSchema = z.object({
  enabled: z.boolean(),
  canConfigure: z.boolean(),
  revision: z.uuid().nullable(),
  defaultGroups: z.number().int().min(2),
  threshold: z.number().min(0).max(10),
  metrics: z.array(metricSchema),
  scores: z.array(
    z.object({
      personId: z.uuid(),
      metricId: z.uuid(),
      value: z.number().int().min(0).max(10),
    }),
  ),
  players: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
type Snapshot = z.infer<typeof evaluationSchema>;

export function PlayerEvaluation({
  request,
  teamId,
}: {
  request: ParticipationFetch;
  teamId: string;
}) {
  const [data, setData] = useState<Snapshot>();
  const [metrics, setMetrics] = useState<Snapshot["metrics"]>([]);
  const [groups, setGroups] = useState(2);
  const [threshold, setThreshold] = useState(7);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const writing = useRef(false);
  const alive = useRef(true);
  const base = `/api/teams/${teamId}/player-evaluation`;
  const apply = useCallback((snapshot: Snapshot) => {
    setData(snapshot);
    setMetrics(snapshot.metrics);
    setGroups(snapshot.defaultGroups);
    setThreshold(snapshot.threshold);
    setError(undefined);
    setGeneration((value) => value + 1);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    alive.current = true;
    request(base, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 403
              ? "Du saknar behörighet till spelarutvärderingen."
              : "Spelarutvärderingen kunde inte hämtas.",
          );
        return evaluationSchema.parse(await response.json());
      })
      .then((snapshot) => {
        if (!controller.signal.aborted) apply(snapshot);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Läsfel");
      });
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [request, base, attempt, apply]);

  async function save(path: string, command: unknown) {
    if (writing.current) return;
    writing.current = true;
    setPending(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const response = await request(path, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? "Underlaget har ändrats. Ditt utkast finns kvar. Läs in aktuella värden innan du försöker igen."
            : response.status === 403
              ? "Åtkomst saknas eller funktionen har stängts av. Ditt utkast finns kvar."
              : "Ändringen kunde inte sparas. Kontrollera värdena. Ditt utkast finns kvar.",
        );
      const snapshot = evaluationSchema.parse(await response.json());
      if (alive.current) {
        apply(snapshot);
        setMessage("Ändringen har sparats.");
      }
    } catch (cause) {
      if (alive.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Sparfel. Ditt utkast finns kvar.",
        );
    } finally {
      writing.current = false;
      if (alive.current) setPending(false);
    }
  }
  if (!data)
    return (
      <section>
        <h1>Spelarutvärdering</h1>
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <p role="status">Laddar spelarutvärdering…</p>
        )}
        <button
          className="secondary"
          onClick={() => setAttempt((value) => value + 1)}
          type="button"
        >
          Försök igen
        </button>
      </section>
    );
  return (
    <section aria-busy={pending}>
      <h1>Spelarutvärdering</h1>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button
            className="secondary"
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  "Läsa in aktuella värden och ersätta ditt utkast?",
                )
              )
                setAttempt((value) => value + 1);
            }}
          >
            Läs in aktuella värden
          </button>
        </div>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {!data.enabled ? (
        <p>
          Funktionen är avstängd. Vid aktivering börjar laget utan mätpunkter
          och betyg.
        </p>
      ) : null}
      {data.canConfigure ? (
        !data.enabled ? (
          <button
            className="secondary"
            type="button"
            disabled={pending}
            onClick={() =>
              void save(base, { revision: data.revision, enabled: true })
            }
          >
            Aktivera spelarutvärdering
          </button>
        ) : (
          <details className="card">
            <summary>Mätpunkter och regler</summary>
            <form
              className="application-form"
              onSubmit={(event) => {
                event.preventDefault();
                const removed = data.metrics.some(
                  (metric) => !metrics.some((item) => item.id === metric.id),
                );
                if (
                  removed &&
                  !window.confirm(
                    "Ta bort mätpunkterna och deras spelarvärden? Detta kan inte ångras.",
                  )
                )
                  return;
                void save(base, {
                  revision: data.revision,
                  enabled: true,
                  metrics,
                  defaultGroups: groups,
                  threshold,
                  confirmDeletion: removed,
                });
              }}
            >
              <fieldset className="discipline-form-fields" disabled={pending}>
                <legend>Lagets egna mätpunkter</legend>
                {metrics.map((metric, index) => (
                  <div key={metric.id}>
                    <label>
                      Namn på mätpunkt {index + 1}
                      <input
                        required
                        maxLength={100}
                        value={metric.name}
                        onChange={(event) =>
                          setMetrics((items) =>
                            items.map((item) =>
                              item.id === metric.id
                                ? { ...item, name: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Typ för mätpunkt {index + 1}
                      <select
                        value={metric.kind}
                        onChange={(event) => {
                          const kind = z
                            .enum(["ability", "development"])
                            .parse(event.target.value);
                          setMetrics((items) =>
                            items.map((item) =>
                              item.id === metric.id ? { ...item, kind } : item,
                            ),
                          );
                        }}
                      >
                        <option value="ability">Förmåga</option>
                        <option value="development">
                          Utvecklingsindikator
                        </option>
                      </select>
                    </label>
                    <button
                      className="secondary"
                      type="button"
                      onClick={() =>
                        setMetrics((items) =>
                          items.filter((item) => item.id !== metric.id),
                        )
                      }
                    >
                      Ta bort {metric.name || "mätpunkt"}
                    </button>
                  </div>
                ))}
                <button
                  className="secondary"
                  type="button"
                  onClick={() =>
                    setMetrics((items) => [
                      ...items,
                      { id: crypto.randomUUID(), name: "", kind: "ability" },
                    ])
                  }
                >
                  Lägg till mätpunkt
                </button>
                <label>
                  Förvalt antal grupper
                  <input
                    type="number"
                    min={2}
                    step={1}
                    required
                    value={groups}
                    onChange={(event) => setGroups(event.target.valueAsNumber)}
                  />
                </label>
                <label>
                  Tröskel för utvecklingsvärde
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step="any"
                    required
                    value={threshold}
                    onChange={(event) =>
                      setThreshold(event.target.valueAsNumber)
                    }
                  />
                </label>
                <button className="primary" type="submit">
                  Spara mätpunkter och regler
                </button>
              </fieldset>
            </form>
            <button
              className="secondary"
              type="button"
              disabled={pending}
              onClick={() => {
                if (
                  window.confirm(
                    "Stänga av spelarutvärdering? Lagets mätpunkter, inställningar och samtliga betyg raderas. Detta kan inte ångras.",
                  )
                )
                  void save(base, {
                    revision: data.revision,
                    enabled: false,
                    confirmDeletion: true,
                  });
              }}
            >
              Stäng av och radera utvärderingsdata
            </button>
          </details>
        )
      ) : null}
      {data.enabled ? (
        <>
          <section className="card">
            <h2>Aktuella betyg</h2>
            <p>
              Gemensamma heltalsbetyg 0–10. Tomt betyder saknar bedömning,
              aldrig noll. Alla mätpunkter inom en typ väger lika.
            </p>
            {data.metrics.length === 0 ? (
              <p>Lagadmin behöver först lägga till mätpunkter.</p>
            ) : (
              <form
                key={generation}
                className="application-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const fields = new FormData(event.currentTarget);
                  const scores = data.players.flatMap((person) =>
                    data.metrics.flatMap((metric) => {
                      const value = String(
                        fields.get(`${person.id}:${metric.id}`) ?? "",
                      );
                      return value === ""
                        ? []
                        : [
                            {
                              personId: person.id,
                              metricId: metric.id,
                              value: Number(value),
                            },
                          ];
                    }),
                  );
                  void save(`${base}/scores`, {
                    revision: data.revision,
                    scores,
                  });
                }}
              >
                <fieldset className="discipline-form-fields" disabled={pending}>
                  <legend>Spelarvärden</legend>
                  {data.players.map((person) => (
                    <details key={person.id}>
                      <summary>{person.name}</summary>
                      {data.metrics.map((metric) => {
                        const saved = data.scores.find(
                          (score) =>
                            score.personId === person.id &&
                            score.metricId === metric.id,
                        );
                        return (
                          <label key={metric.id}>
                            {metric.name} ·{" "}
                            {metric.kind === "ability"
                              ? "Förmåga"
                              : "Utvecklingsindikator"}
                            <input
                              aria-label={`${person.name}: ${metric.name}`}
                              type="number"
                              min={0}
                              max={10}
                              step={1}
                              required={saved !== undefined}
                              name={`${person.id}:${metric.id}`}
                              defaultValue={saved?.value ?? ""}
                              placeholder="Saknar bedömning"
                            />
                          </label>
                        );
                      })}
                    </details>
                  ))}
                  <button className="primary" type="submit">
                    Spara betyg
                  </button>
                </fieldset>
              </form>
            )}
          </section>
          <ExtensionReadViews
            key={generation}
            teamId={teamId}
            request={request}
          />
        </>
      ) : null}
    </section>
  );
}
