"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { DisciplineDefaultsFields } from "./discipline-defaults-fields";
import {
  normalizeDefaultsPatch,
  resolveDisciplineDefaults,
} from "../lib/discipline-defaults";
import type { ParticipationFetch } from "./activity-invitation-response";
const rowSchema = z.object({
  id: z.uuid(),
  activityTypeId: z.uuid(),
  scope: z.enum(["section", "team"]),
  scopeId: z.uuid(),
  disciplineKey: z.string(),
  version: z.string(),
  revision: z.number(),
  valuesJson: z.string(),
});
const schema = z.object({
  organizationId: z.uuid(),
  scope: z.enum(["section", "team"]),
  scopeId: z.uuid(),
  sectionId: z.uuid().nullable(),
  disciplineKey: z.string(),
  version: z.string(),
  types: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      slug: z.string(),
      system_category: z.enum([
        "session",
        "competition",
        "meeting",
        "education",
        "work",
        "other",
      ]),
      organization_id: z.uuid().nullable(),
    }),
  ),
  rows: z.array(rowSchema),
});
export function ActivityDefaultsAdministration({
  scope,
  scopeId,
  request,
  onChanged,
}: {
  onChanged?: () => void;
  scope: "section" | "team";
  scopeId: string;
  request: ParticipationFetch;
}) {
  const [data, setData] = useState<z.infer<typeof schema>>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [typeId, setTypeId] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    request(
      `/api/activity-defaults?${new URLSearchParams({ scope, scopeId })}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const snapshot = schema.parse(await response.json());
        if (!controller.signal.aborted) {
          setData(snapshot);
          setError(undefined);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Aktivitetsförvalen kunde inte hämtas.");
      });
    return () => controller.abort();
  }, [request, scope, scopeId, attempt]);
  const type = data?.types.find((type) => type.id === typeId) ?? data?.types[0];
  return (
    <section className="discipline-fields">
      <h3>Aktivitetsförval</h3>
      <p>
        Förval och valbara tider ärvs fältvis från disciplin till sektion och
        lag. Befintliga aktiviteter ändras inte.
      </p>
      {error ? (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            Läs in igen
          </button>
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {data && type ? (
        <>
          <label>
            Aktivitetstyp
            <select
              value={type.id}
              onChange={(event) => {
                setTypeId(event.target.value);
                setNotice(undefined);
              }}
            >
              {data.types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <DefaultsForm
            key={`${scopeId}:${type.id}:${attempt}`}
            data={data}
            type={type}
            request={request}
            onSaved={() => {
              setNotice("Aktivitetsförvalen har sparats.");
              onChanged?.();
              setAttempt((n) => n + 1);
            }}
          />
        </>
      ) : null}
    </section>
  );
}
function DefaultsForm({
  data,
  type,
  request,
  onSaved,
}: {
  data: z.infer<typeof schema>;
  type: z.infer<typeof schema>["types"][number];
  request: ParticipationFetch;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const context = {
    activityTypeId: type.id,
    organizationId: data.organizationId,
    sectionId: data.sectionId ?? "",
    teamId: data.scope === "team" ? data.scopeId : "",
    disciplineId: data.disciplineKey,
    disciplineKey: data.disciplineKey,
    activityTypeSlug: type.slug,
    activityCategory: type.system_category,
  };
  const current = data.rows.find(
    (row) => row.scope === data.scope && row.activityTypeId === type.id,
  );
  const initial = current
    ? normalizeDefaultsPatch(JSON.parse(current.valuesJson), context)
    : {};
  const inherited = data.rows
    .filter((row) => row.id !== current?.id)
    .map((row) => ({
      ...row,
      organizationId: data.organizationId,
      disciplineId: row.disciplineKey,
      values: normalizeDefaultsPatch(JSON.parse(row.valuesJson), context),
    }));
  const resolved = resolveDisciplineDefaults(context, inherited);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const form = new FormData(event.currentTarget);
      const values = normalizeDefaultsPatch(
        JSON.parse(String(form.get("values"))),
        context,
      );
      const response = await request("/api/activity-defaults", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: data.scope,
          scopeId: data.scopeId,
          activityTypeId: type.id,
          revision: current?.revision ?? 0,
          values,
        }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? "Förvalen har ändrats. Ditt utkast finns kvar. Läs in senaste värden innan du sparar igen."
            : "Förvalen kunde inte sparas. Kontrollera tiderna.",
        );
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Förvalen kunde inte sparas.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="application-form" onSubmit={save}>
      <fieldset disabled={busy}>
        <DisciplineDefaultsFields initial={initial} resolved={resolved} />
      </fieldset>
      {error ? <p role="alert">{error}</p> : null}
      <button className="primary" disabled={busy}>
        {busy ? "Sparar…" : "Spara aktivitetsförval"}
      </button>
    </form>
  );
}
