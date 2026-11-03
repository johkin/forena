"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  AttendanceModal,
  type AttendanceDraft,
  type AttendanceRow,
} from "./attendance-modal";
import type { ParticipationFetch } from "./activity-invitation-response";

const valueSchema = z.union([z.string(), z.array(z.string())]);
const definitionSchema = z.object({
  key: z.string(),
  version: z.string(),
  title: z.string(),
  capabilityKey: z.string().nullable().optional(),
  fields: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      type: z.enum(["choice", "player", "players"]),
      options: z.array(z.object({ id: z.string(), name: z.string() })),
      visibleWhen: z
        .object({ field: z.string(), value: z.string() })
        .nullable()
        .optional(),
    }),
  ),
});
export const informationItemSchema = z.object({
  definition: definitionSchema,
  revision: z.number(),
  state: z.enum(["open", "answered", "closed"]),
  closeReason: z.string().nullable(),
  values: z.record(z.string(), valueSchema),
});
const playerSchema = z.object({ id: z.uuid(), name: z.string() });
const snapshotSchema = z.object({
  activityId: z.uuid(),
  title: z.string(),
  attendanceRevision: z.number(),
  canManageAttendance: z.boolean(),
  editable: z.boolean(),
  players: z.array(playerSchema),
  contributions: z.array(informationItemSchema),
  history: z.array(
    z.object({
      ownerKey: z.string(),
      revision: z.number(),
      actorName: z.string(),
      changedAt: z.string(),
      previous: z.record(z.string(), valueSchema),
      values: z.record(z.string(), valueSchema),
      state: z.string(),
      names: z.record(z.string(), z.string()),
    }),
  ),
});
type Values = z.infer<typeof informationItemSchema>["values"];

export function ActivityFollowUp({
  activityId,
  request,
}: {
  activityId: string;
  request: ParticipationFetch;
}) {
  return (
    <FollowUp key={activityId} activityId={activityId} request={request} />
  );
}
function FollowUp({
  activityId,
  request,
}: {
  activityId: string;
  request: ParticipationFetch;
}) {
  const [data, setData] = useState<z.infer<typeof snapshotSchema>>();
  const [drafts, setDrafts] = useState<Record<string, Values>>({});
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [hidden, setHidden] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [attendance, setAttendance] = useState<{
    command: AttendanceDraft;
    players: { id: string; name: string }[];
  }>();
  const active = useRef(true);
  const writing = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    active.current = true;
    request(`/api/activities/${activityId}/follow-up`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if ([400, 403, 404].includes(response.status)) {
          if (!controller.signal.aborted) setHidden(true);
          return;
        }
        if (!response.ok)
          throw new Error("Matchuppföljningen kunde inte hämtas.");
        const snapshot = snapshotSchema.parse(await response.json());
        if (controller.signal.aborted) return;
        setData(snapshot);
        setDrafts(
          Object.fromEntries(
            snapshot.contributions.map((item) => [
              item.definition.key,
              item.values,
            ]),
          ),
        );
        setError(undefined);
        setAttendance(undefined);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Matchuppföljningen kunde inte hämtas. Försök igen.");
      });
    return () => {
      active.current = false;
      controller.abort();
    };
  }, [request, activityId, attempt]);
  if (hidden) return null;
  const players = attendance?.players ?? data?.players ?? [];
  const setValue = (owner: string, key: string, value?: Values[string]) =>
    setDrafts((current) => {
      const next = { ...current[owner] };
      if (value === undefined) delete next[key];
      else next[key] = value;
      data?.contributions
        .find((item) => item.definition.key === owner)
        ?.definition.fields.forEach((field) => {
          if (
            field.visibleWhen?.field === key &&
            value !== field.visibleWhen.value
          )
            delete next[field.key];
        });
      return { ...current, [owner]: next };
    });
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!data || writing.current) return;
    writing.current = true;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const response = await request(
        `/api/activities/${activityId}/follow-up`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            answers: data.contributions
              .filter(
                (item) =>
                  item.state !== "closed" ||
                  Object.keys(item.values).length > 0,
              )
              .map((item) => ({
                ownerKey: item.definition.key,
                revision: item.revision,
                values: drafts[item.definition.key] ?? {},
              })),
            attendance: attendance?.command,
          }),
        },
      );
      if (!response.ok) {
        const problem = z
          .object({ error: z.string() })
          .safeParse(await response.json().catch(() => null));
        throw new Error(
          problem.success
            ? problem.data.error
            : "Uppgifterna kunde inte sparas. Ditt utkast finns kvar.",
        );
      }
      const snapshot = snapshotSchema.parse(await response.json());
      if (active.current) {
        setData(snapshot);
        setDrafts(
          Object.fromEntries(
            snapshot.contributions.map((item) => [
              item.definition.key,
              item.values,
            ]),
          ),
        );
        setAttendance(undefined);
        setNotice("Matchuppföljningen har sparats.");
      }
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Uppgifterna kunde inte sparas.",
        );
    } finally {
      writing.current = false;
      if (active.current) setBusy(false);
    }
  }
  function describe(
    values: Values,
    owner: string,
    names: Record<string, string>,
  ) {
    const definition = data?.contributions.find(
      (item) => item.definition.key === owner,
    )?.definition;
    return (
      Object.entries(values)
        .map(([key, value]) => {
          const field = definition?.fields.find((field) => field.key === key);
          const label = (v: string) =>
            field?.options.find((option) => option.id === v)?.name ??
            names[v] ??
            players.find((player) => player.id === v)?.name ??
            "Tidigare vald spelare";
          return `${field?.title ?? "Uppgift"}: ${Array.isArray(value) ? value.map(label).join(", ") : label(value)}`;
        })
        .join(" · ") || "Ej registrerat"
    );
  }
  function prepared(command: AttendanceDraft, rows: AttendanceRow[]) {
    setAttendance({
      command,
      players: rows
        .filter(
          (row) =>
            row.role === "participant" &&
            command.personIds.includes(row.personId),
        )
        .map((row) => ({ id: row.personId, name: row.displayName })),
    });
  }
  return (
    <section className="discipline-fields" aria-label="Matchuppföljning">
      <h3>Matchuppföljning</h3>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? (
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => setAttempt((n) => n + 1)}
        >
          Läs in senaste uppgifter – ersätter utkastet
        </button>
      ) : null}
      {!data && !error ? <p role="status">Hämtar matchuppföljning…</p> : null}
      {data ? (
        <>
          <p>
            {data.contributions.some((item) => item.state === "open")
              ? "Uppföljningen är ofullständig. Delar kan sparas medan övriga uppgifter saknas."
              : "Inga obesvarade uppföljningspunkter."}
          </p>
          {!data.attendanceRevision && !attendance ? (
            <p>
              Registrera närvaron först. Ett ja-svar på kallelsen räcker inte
              som närvaro.
            </p>
          ) : null}
          {data.canManageAttendance && data.editable ? (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => setAttendanceOpen(true)}
            >
              {data.attendanceRevision
                ? "Rätta närvaro och matchutfall tillsammans"
                : "Registrera närvaro för uppföljningen"}
            </button>
          ) : null}
          {attendance ? (
            <p role="status">
              Närvaroutkastet sparas tillsammans med matchuppgifterna. Ingen del
              är sparad ännu.
            </p>
          ) : null}
          <form className="application-form" onSubmit={save}>
            <fieldset
              disabled={
                busy ||
                !data.editable ||
                (!data.attendanceRevision && !attendance)
              }
            >
              {data.contributions.map((item) => (
                <fieldset
                  key={item.definition.key}
                  disabled={
                    item.state === "closed" &&
                    Object.keys(item.values).length === 0
                  }
                >
                  <legend>{item.definition.title}</legend>
                  {item.state === "closed" ? (
                    <p>
                      Avslutad:{" "}
                      {item.closeReason === "capability_disabled"
                        ? "funktionen stängdes av"
                        : "aktiviteten ställdes in"}
                      . Sparade uppgifter finns kvar.
                    </p>
                  ) : null}
                  {item.definition.fields
                    .filter(
                      (field) =>
                        !field.visibleWhen ||
                        drafts[item.definition.key]?.[
                          field.visibleWhen.field
                        ] === field.visibleWhen.value,
                    )
                    .map((field) => {
                      const value = drafts[item.definition.key]?.[field.key];
                      if (field.type === "players")
                        return (
                          <fieldset key={field.key}>
                            <legend>{field.title}</legend>
                            {players.map((player) => (
                              <label
                                className="settings-checkbox"
                                key={player.id}
                              >
                                <input
                                  type="checkbox"
                                  checked={
                                    Array.isArray(value) &&
                                    value.includes(player.id)
                                  }
                                  onChange={(event) =>
                                    setValue(
                                      item.definition.key,
                                      field.key,
                                      event.target.checked
                                        ? [
                                            ...(Array.isArray(value)
                                              ? value
                                              : []),
                                            player.id,
                                          ]
                                        : (Array.isArray(value)
                                            ? value
                                            : []
                                          ).filter((id) => id !== player.id),
                                    )
                                  }
                                />
                                {player.name}
                              </label>
                            ))}
                            {Array.isArray(value) &&
                            value.some(
                              (id) => !players.some((p) => p.id === id),
                            ) ? (
                              <p role="alert">
                                En tidigare mottagare saknas i närvaroutkastet.
                                Ta bort mottagaren eller rätta närvaron.
                              </p>
                            ) : null}
                            {Array.isArray(value)
                              ? value
                                  .filter(
                                    (id) => !players.some((p) => p.id === id),
                                  )
                                  .map((id) => (
                                    <button
                                      key={id}
                                      type="button"
                                      onClick={() =>
                                        setValue(
                                          item.definition.key,
                                          field.key,
                                          value.filter((p) => p !== id),
                                        )
                                      }
                                    >
                                      Ta bort tidigare mottagare
                                    </button>
                                  ))
                              : null}
                          </fieldset>
                        );
                      const options =
                        field.type === "player" ? players : field.options;
                      return (
                        <label key={field.key}>
                          {field.title}
                          <select
                            aria-label={field.title}
                            value={String(value ?? "")}
                            onChange={(event) =>
                              setValue(
                                item.definition.key,
                                field.key,
                                event.target.value || undefined,
                              )
                            }
                          >
                            <option value="">Ännu inte registrerat</option>
                            {value && !options.some((p) => p.id === value) ? (
                              <option value={String(value)} disabled>
                                Tidigare val saknas i närvaron
                              </option>
                            ) : null}
                            {options.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    })}
                </fieldset>
              ))}
            </fieldset>
            {data.editable ? (
              <button
                className="primary"
                disabled={busy || (!data.attendanceRevision && !attendance)}
              >
                {busy ? "Sparar…" : "Spara matchuppföljning"}
              </button>
            ) : null}
          </form>
          {data.history.length ? (
            <details>
              <summary>Ändringshistorik</summary>
              {data.history.map((item) => (
                <div key={`${item.ownerKey}:${item.revision}`}>
                  <strong>{item.actorName}</strong> ·{" "}
                  <time dateTime={item.changedAt}>
                    {new Date(item.changedAt).toLocaleString("sv-SE")}
                  </time>
                  <p>
                    {describe(item.previous, item.ownerKey, item.names)} →{" "}
                    {describe(item.values, item.ownerKey, item.names)}
                  </p>
                </div>
              ))}
            </details>
          ) : null}
        </>
      ) : null}
      {attendanceOpen ? (
        <AttendanceModal
          activityId={activityId}
          request={request}
          versioned
          onPrepared={prepared}
          onClose={() => setAttendanceOpen(false)}
        />
      ) : null}
    </section>
  );
}
