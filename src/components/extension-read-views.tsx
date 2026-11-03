"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import type { ParticipationFetch } from "./activity-invitation-response";

const cell = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("number"), number: z.number().finite() }),
  z.object({ type: z.literal("missing") }),
]);
const row = z.object({
  id: z.string(),
  cells: z.record(z.string(), cell),
  markers: z.array(z.string()),
});
const columns = z.array(z.object({ id: z.string(), title: z.string() }));
const common = { title: z.string(), message: z.string().nullable().optional() };
export const readViewSchema = z.discriminatedUnion("type", [
  z.object({ ...common, type: z.literal("information"), message: z.string() }),
  z.object({ ...common, type: z.literal("list"), columns, rows: z.array(row) }),
  z.object({
    ...common,
    type: z.literal("table"),
    columns,
    rows: z.array(row),
  }),
  z.object({
    ...common,
    type: z.literal("groupedList"),
    columns,
    groups: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        summary: z.string(),
        rows: z.array(row),
      }),
    ),
  }),
]);
const option = z.object({ id: z.string(), name: z.string() });
export const readContributionSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  capabilityKey: z.string(),
  title: z.string(),
  placement: z.enum(["activity", "teamReport"]),
  order: z.number().int(),
  filters: z.array(
    z.discriminatedUnion("type", [
      z.object({
        id: z.string(),
        title: z.string(),
        type: z.literal("integer"),
        value: z.string(),
        minimum: z.number(),
        maximum: z.number(),
      }),
      z.object({
        id: z.string(),
        title: z.string(),
        type: z.literal("choice"),
        value: z.string(),
        options: z.array(option),
      }),
      z.object({
        id: z.string(),
        title: z.string(),
        type: z.literal("people"),
        selected: z.array(z.string()),
        options: z.array(option),
      }),
    ]),
  ),
  views: z.array(readViewSchema),
});
export type ReadContribution = z.infer<typeof readContributionSchema>;
type View = z.infer<typeof readViewSchema>;

function Cell({ value }: { value: z.infer<typeof cell> | undefined }) {
  if (!value || value.type === "missing") return <>Saknar bedömning</>;
  return (
    <>
      {value.type === "text"
        ? value.text
        : new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 }).format(
            value.number,
          )}
    </>
  );
}

/** Renderers depend on the versioned view type, never on a capability ID or metric name. */
export function ExtensionReadView({ view }: { view: View }) {
  function list(rows: z.infer<typeof row>[], cols: z.infer<typeof columns>) {
    return (
      <ul>
        {rows.map((item) => (
          <li key={item.id}>
            {cols.map((col, index) => (
              <span key={col.id}>
                {index > 0 ? ` · ${col.title}: ` : ""}
                <Cell value={item.cells[col.id]} />
              </span>
            ))}
            {item.markers.map((marker) => (
              <p className="auth-message" key={marker}>
                {marker}
              </p>
            ))}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <section className="extension-read-view">
      <h3>{view.title}</h3>
      {view.message ? <p>{view.message}</p> : null}
      {view.type === "list" ? list(view.rows, view.columns) : null}
      {view.type === "groupedList" ? (
        <div className="extension-view-groups">
          {view.groups.map((group) => (
            <section className="card" key={group.id}>
              <h4>{group.title}</h4>
              <p>{group.summary}</p>
              {list(group.rows, view.columns)}
            </section>
          ))}
        </div>
      ) : null}
      {view.type === "table" ? (
        <div
          className="extension-view-table"
          tabIndex={0}
          role="region"
          aria-label={view.title}
        >
          <table>
            <thead>
              <tr>
                {view.columns.map((col) => (
                  <th key={col.id} scope="col">
                    {col.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.rows.map((item) => (
                <tr key={item.id}>
                  {view.columns.map((col, index) =>
                    index === 0 ? (
                      <th key={col.id} scope="row">
                        <Cell value={item.cells[col.id]} />
                        {item.markers.map((marker) => (
                          <p key={marker}>{marker}</p>
                        ))}
                      </th>
                    ) : (
                      <td key={col.id}>
                        <Cell value={item.cells[col.id]} />
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

export function ExtensionReadViews({
  request,
  teamId,
  activityId,
}: {
  request: ParticipationFetch;
  teamId: string;
  activityId?: string;
}) {
  const [entries, setEntries] = useState<unknown[]>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [generation, setGeneration] = useState(0);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string>();
  const base = `/api/teams/${teamId}/read-views`;
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(query);
    if (activityId) params.set("activityId", activityId);
    request(`${base}${params.size ? `?${params}` : ""}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 400
              ? "Kontrollera gruppantalet och spelarurvalet. Uppdatera för att läsa aktuellt underlag."
              : "Underlaget kunde inte hämtas. Försök igen.",
          );
        return z.array(z.unknown()).parse(await response.json());
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setEntries(data);
            setGeneration((value) => value + 1);
          setError(undefined);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setEntries(undefined);
          setError(cause instanceof Error ? cause.message : "Läsfel");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [request, base, activityId, query, attempt]);

  function refresh() {
    setPending(true);
    setQuery("");
    setAttempt((value) => value + 1);
  }
  if (error)
    return (
      <section>
        <p role="alert">{error}</p>
        <button className="secondary" type="button" onClick={refresh}>
          Uppdatera
        </button>
      </section>
    );
  if (!entries) return <p role="status">Laddar tillägg…</p>;
  if (entries.length === 0) return null;
  return (
    <section aria-label="Tillägg" aria-busy={pending}>
      {entries.map((entry, index) => {
        const parsed = readContributionSchema.safeParse(entry);
        if (!parsed.success)
          return (
            <p role="status" key={index}>
              Det här tillägget kan inte visas med den aktuella versionen.
            </p>
          );
        const contribution = parsed.data;
        return (
          <section className="card" key={contribution.id}>
            <button
              className="secondary"
              type="button"
              aria-expanded={open === contribution.id}
              onClick={() => {
                setOpen(open === contribution.id ? undefined : contribution.id);
                if (open !== contribution.id) refresh();
              }}
            >
              {contribution.title}
            </button>
            {open === contribution.id ? (
              <>
                <p>
                  Förslaget är tillfälligt. Ledaren beslutar faktisk indelning
                  på plats. Välj Uppdatera för aktuella betyg och kallelsesvar.
                </p>
                <form
                  className="application-form"
                  key={generation}
                  onChange={(event) => {
                    if (event.currentTarget.checkValidity())
                      event.currentTarget.requestSubmit();
                  }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    const params = new URLSearchParams();
                    contribution.filters.forEach((filter) => {
                      if (filter.type === "people")
                        params.set(
                          filter.id,
                          data.getAll(filter.id).map(String).join(","),
                        );
                      else
                        params.set(
                          filter.id,
                          String(data.get(filter.id) ?? ""),
                        );
                    });
                    setPending(true);
                    setQuery(params.toString());
                    setAttempt((value) => value + 1);
                  }}
                >
                  {contribution.filters.map((filter) =>
                    filter.type === "people" ? (
                      <fieldset
                        className="discipline-form-fields"
                        key={filter.id}
                      >
                        <legend>{filter.title}</legend>
                        {filter.options.map((person) => (
                          <label key={person.id}>
                            <input
                              type="checkbox"
                              name={filter.id}
                              value={person.id}
                              defaultChecked={filter.selected.includes(
                                person.id,
                              )}
                            />
                            {person.name}
                          </label>
                        ))}
                      </fieldset>
                    ) : (
                      <label key={filter.id}>
                        {filter.title}
                        {filter.type === "integer" ? (
                          <input
                            type="number"
                            name={filter.id}
                            min={filter.minimum}
                            max={filter.maximum}
                            step={1}
                            defaultValue={filter.value}
                            required
                          />
                        ) : (
                          <select name={filter.id} defaultValue={filter.value}>
                            {filter.options.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </label>
                    ),
                  )}
                  <button className="primary" disabled={pending} type="submit">
                    Beräkna förslag
                  </button>
                  <button
                    className="secondary"
                    disabled={pending}
                    type="button"
                    onClick={refresh}
                  >
                    Uppdatera
                  </button>
                </form>
                {pending ? (
                  <p role="status">Beräknar…</p>
                ) : (
                  contribution.views.map((view, viewIndex) => (
                    <ExtensionReadView key={viewIndex} view={view} />
                  ))
                )}
              </>
            ) : null}
          </section>
        );
      })}
    </section>
  );
}
