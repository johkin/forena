"use client";

import { useCallback, useRef, useState } from "react";
import type { ParticipationFetch } from "./activity-invitation-response";
import { PlayerEvaluation, evaluationSchema } from "./player-evaluation";
import {
  ExtensionReadViews,
  type ReadContribution,
} from "./extension-read-views";

const team = "10000000-0000-4000-8000-000000000001";
const person = "10000000-0000-4000-8000-000000000002";
const metric = "10000000-0000-4000-8000-000000000003";
const revision = "10000000-0000-4000-8000-000000000004";
export const sampleReadContribution: ReadContribution = {
  schemaVersion: 1,
  id: "example",
  capabilityKey: "independent-example",
  placement: "teamReport",
  order: 0,
  title: "Gruppförslag",
  filters: [],
  views: [
    {
      type: "groupedList",
      title: "Grupper efter förmåga",
      columns: [{ id: "name", title: "Spelare" }],
      groups: [
        {
          id: "high",
          title: "Förmågegrupp 1",
          summary: "1 spelare · Genomsnittlig förmåga 9",
          rows: [
            {
              id: "a",
              cells: { name: { type: "text", text: "Alex Exempel" } },
              markers: [],
            },
          ],
        },
        {
          id: "low",
          title: "Förmågegrupp 2",
          summary: "1 spelare · Genomsnittlig förmåga 5",
          rows: [
            {
              id: "b",
              cells: { name: { type: "text", text: "Kim Exempel" } },
              markers: ["Kan prova nästa förmågegrupp – ledaren beslutar"],
            },
          ],
        },
      ],
    },
    {
      type: "list",
      title: "Saknar bedömning",
      columns: [{ id: "name", title: "Spelare" }],
      rows: [
        {
          id: "c",
          cells: { name: { type: "text", text: "Robin Exempel" } },
          markers: [],
        },
      ],
    },
    {
      type: "table",
      title: "Aktuella spelarvärden",
      columns: [
        { id: "name", title: "Spelare" },
        { id: "ability", title: "Förmåga" },
        { id: "development", title: "Utveckling" },
      ],
      rows: [
        {
          id: "a",
          cells: {
            name: { type: "text", text: "Alex Exempel" },
            ability: { type: "number", number: 9 },
            development: { type: "missing" },
          },
          markers: [],
        },
      ],
    },
    {
      type: "information",
      title: "Så fungerar förslaget",
      message:
        "Ledaren beslutar faktisk indelning på plats. Saknade värden räknas aldrig som noll.",
    },
  ],
};

export function PlayerEvaluationExamples() {
  const [state, setState] = useState("ready");
  return (
    <section>
      <h2>Spelarutvärdering och gemensamma tilläggsvyer</h2>
      <label>
        Exempeltillstånd
        <select
          value={state}
          onChange={(event) => setState(event.target.value)}
        >
          <option value="ready">Aktiverat</option>
          <option value="disabled">Avstängt</option>
          <option value="leader">Ledare utan lagadmin</option>
          <option value="conflict">Revisionskonflikt vid sparande</option>
          <option value="error">Läsfel</option>
          <option value="loading">Laddar</option>
          <option value="unknown">Okänd vyversion</option>
        </select>
      </label>
      <EvaluationExample key={state} state={state} />
    </section>
  );
}

function EvaluationExample({ state }: { state: string }) {
  const snapshot = useRef(
    evaluationSchema.parse({
      enabled: state !== "disabled",
      canConfigure: state !== "leader",
      revision,
      defaultGroups: 2,
      threshold: 7,
      metrics: [{ id: metric, name: "Spelförståelse", kind: "ability" }],
      scores: [{ personId: person, metricId: metric, value: 6 }],
      players: [{ id: person, name: "Robin Exempel" }],
    }),
  );
  const request = useCallback<ParticipationFetch>(
    async (path, init) => {
      if (state === "loading")
        return new Promise((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Avbruten", "AbortError")),
          ),
        );
      if (state === "error") return Response.json({}, { status: 503 });
      if (path.includes("read-views"))
        return Response.json(
          state === "unknown"
            ? [{ ...sampleReadContribution, schemaVersion: 99 }]
            : [
                sampleReadContribution,
                {
                  ...sampleReadContribution,
                  id: "second",
                  capabilityKey: "another-capability",
                  title: "En annan capability",
                },
              ],
        );
      if (init?.method === "PUT") {
        if (state === "conflict") return Response.json({}, { status: 409 });
        const change: unknown = JSON.parse(String(init.body));
        if (typeof change === "object" && change !== null)
          snapshot.current = evaluationSchema.parse({
            ...snapshot.current,
            ...change,
            revision: crypto.randomUUID(),
          });
      }
      return Response.json(snapshot.current);
    },
    [state],
  );
  return state === "unknown" ? (
    <ExtensionReadViews request={request} teamId={team} />
  ) : (
    <PlayerEvaluation teamId={team} request={request} />
  );
}
