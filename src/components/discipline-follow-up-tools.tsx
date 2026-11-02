"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { informationItemSchema } from "./activity-follow-up";
import type { NavigationLink } from "./navigation-link";
import type { ParticipationFetch } from "./activity-invitation-response";

const settingsSchema = z.array(
  z.object({
    key: z.string(),
    name: z.string(),
    enabled: z.boolean(),
    adjustable: z.boolean(),
    revision: z.number(),
    editable: z.boolean(),
  }),
);
const reportSchema = z.object({
  teamId: z.uuid(),
  from: z.string(),
  until: z.string(),
  players: z.array(z.object({ id: z.uuid(), name: z.string() })),
  entries: z.array(
    z.object({
      activityId: z.uuid(),
      title: z.string(),
      startsAt: z.string(),
      contributions: z.array(informationItemSchema),
    }),
  ),
});

export function DisciplineFollowUpTools({
  teamId,
  request,
}: {
  teamId: string;
  request: ParticipationFetch;
}) {
  const [settings, setSettings] = useState<z.infer<typeof settingsSchema>>();
  const [error, setError] = useState<string>();
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    request(`/api/teams/${teamId}/capabilities`, { signal: controller.signal })
      .then(async (response) => {
        if ([400, 403, 404].includes(response.status)) return;
        if (!response.ok) throw new Error();
        const data = settingsSchema.parse(await response.json());
        if (!controller.signal.aborted) setSettings(data);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Disciplininställningarna kunde inte hämtas.");
      });
    return () => controller.abort();
  }, [request, teamId, reload]);
  async function toggle(item: NonNullable<typeof settings>[number]) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await request(`/api/teams/${teamId}/capabilities`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: item.key,
          revision: item.revision,
          enabled: !item.enabled,
        }),
      });
      if (!response.ok) throw new Error();
      setReload((n) => n + 1);
    } catch {
      setError(
        "Inställningen kunde inte sparas. Läs in aktuella inställningar och försök igen.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (settings?.length === 0) return null;
  return (
    <section className="discipline-fields">
      <h3>Disciplinens funktioner</h3>
      {error ? (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => setReload((n) => n + 1)}>
            Läs in igen
          </button>
        </p>
      ) : null}
      {settings?.map((item) => (
        <label className="settings-checkbox" key={item.key}>
          <input
            type="checkbox"
            checked={item.enabled}
            disabled={busy || !item.editable}
            onChange={() => void toggle(item)}
          />
          {item.name}
          {!item.adjustable ? <small>Styrs av disciplinen</small> : null}
        </label>
      ))}
      <details>
        <summary>Spelarhistorik och uppföljningsrapport</summary>
        <DisciplineInformationReport teamId={teamId} request={request} />
      </details>
    </section>
  );
}

export function DisciplineInformationReport({
  teamId,
  request,
  linkComponent: Link = "a",
}: {
  teamId: string;
  request: ParticipationFetch;
  linkComponent?: NavigationLink;
}) {
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [period, setPeriod] = useState<{
    from?: string;
    until?: string;
    season?: string;
  }>();
  const [zone, setZone] = useState<string>();
  const [season, setSeason] = useState<string>();
  const [seasonYear, setSeasonYear] = useState("");
  const [data, setData] = useState<z.infer<typeof reportSchema>>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams(
      period?.season
        ? { season: period.season }
        : period?.from && period.until
          ? { fromDate: period.from, untilDate: period.until }
          : {},
    );
    request(`/api/teams/${teamId}/information-report?${query}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const result = z
          .object({
            timeZone: z.string(),
            season: z.string(),
            fromDate: z.string(),
            untilDate: z.string(),
            report: reportSchema,
          })
          .parse(await response.json());
        if (!controller.signal.aborted) {
          setError(undefined);
          setData(result.report);
          setZone(result.timeZone);
          setSeason(result.season);
          setSeasonYear(result.fromDate.slice(0, 4));
          setFrom(result.fromDate);
          setUntil(result.untilDate);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setData(undefined);
          setError(
            "Rapporten kunde inte hämtas. Kontrollera period och behörighet.",
          );
        }
      });
    return () => controller.abort();
  }, [request, teamId, period]);
  const owners = [
    ...new Map(
      data?.entries.flatMap((entry) =>
        entry.contributions.map(
          (item) => [item.definition.key, item.definition] as const,
        ),
      ),
    ).values(),
  ];
  function references(values: z.infer<typeof informationItemSchema>["values"]) {
    return Object.values(values)
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter((value) => z.uuid().safeParse(value).success);
  }
  return (
    <section>
      <h3>Spelarhistorik</h3>
      <p>
        {season ? `Säsong: ${season}. ` : ""}
        {zone ? `Datum i ${zone}.` : ""}Välj datum för äldre säsonger eller en
        egen period.
      </p>
      <form
        className="application-form"
        onSubmit={(event) => {
          event.preventDefault();
          setPeriod({ from, until });
        }}
      >
        <label>
          Säsong (år)
          <input
            type="number"
            min={1900}
            max={2200}
            step={1}
            value={seasonYear}
            onChange={(event) => setSeasonYear(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="secondary"
          onClick={() => setPeriod({ season: seasonYear })}
          disabled={
            !/^\d{4}$/.test(seasonYear) ||
            Number(seasonYear) < 1900 ||
            Number(seasonYear) > 2200
          }
        >
          Visa säsong
        </button>
        <label>
          Från och med
          <input
            type="date"
            required
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          Före
          <input
            type="date"
            required
            value={until}
            onChange={(event) => setUntil(event.target.value)}
          />
        </label>
        <button className="secondary">Visa period</button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {data ? (
        <>
          <p>{data.entries.length} spelade matcher i perioden.</p>
          {owners.map((owner) => {
            const items = data.entries
              .map((entry) =>
                entry.contributions.find(
                  (item) => item.definition.key === owner.key,
                ),
              )
              .filter((item) => item !== undefined);
            const missing = items.filter(
              (item) => item.state === "open",
            ).length;
            const closed = items.filter(
              (item) => item.state === "closed",
            ).length;
            return (
              <p key={owner.key}>
                {owner.title}:{" "}
                {items.filter((item) => item.state === "answered").length}{" "}
                besvarade, {missing} saknade uppgifter
                {closed ? `, ${closed} avslutade utan fullständigt svar` : ""}.
              </p>
            );
          })}
          {data.players.map((player) => (
            <details key={player.id}>
              <summary>{player.name}</summary>
              {owners.map((owner) => {
                const matches = data.entries.filter((entry) =>
                  entry.contributions.some(
                    (item) =>
                      item.definition.key === owner.key &&
                      references(item.values).includes(player.id),
                  ),
                );
                return (
                  <div key={owner.key}>
                    <strong>
                      {owner.title}: {matches.length}
                    </strong>
                    <ul>
                      {matches.map((entry) => (
                        <li key={entry.activityId}>
                          <Link href={`/activities/${entry.activityId}`}>
                            {new Date(entry.startsAt).toLocaleDateString(
                              "sv-SE",
                            )}{" "}
                            · {entry.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </details>
          ))}
        </>
      ) : null}
    </section>
  );
}
