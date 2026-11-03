"use client";

import { useCallback, useRef, useState } from "react";
import { z } from "zod";
import { ActivityFollowUp, informationItemSchema } from "./activity-follow-up";
import { DisciplineFollowUpTools } from "./discipline-follow-up-tools";
import type { ParticipationFetch } from "./activity-invitation-response";

const activity = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const team = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const players = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Alex Exempel" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Robin Exempel" },
];
const definitions = [
  {
    key: "actualCaptain",
    version: "1.0.0",
    title: "Faktisk lagkapten",
    capabilityKey: null,
    fields: [
      {
        key: "actualCaptainPersonId",
        title: "Faktisk lagkapten",
        type: "player",
        options: [],
        visibleWhen: null,
      },
    ],
  },
  {
    key: "greenCard",
    version: "1.0.0",
    title: "Gröna kortet",
    capabilityKey: "greenCard",
    fields: [
      {
        key: "outcome",
        title: "Delades Gröna kortet ut?",
        type: "choice",
        options: [
          { id: "none", name: "Inget kort utdelat" },
          { id: "awarded", name: "Kort utdelat" },
        ],
        visibleWhen: null,
      },
      {
        key: "recipientIds",
        title: "Mottagare",
        type: "players",
        options: [],
        visibleWhen: { field: "outcome", value: "awarded" },
      },
    ],
  },
];
const initial = definitions.map((definition) =>
  informationItemSchema.parse({
    definition,
    revision: 0,
    state: "open",
    closeReason: null,
    values: {},
  }),
);
export function InformationExamples() {
  const [mode, setMode] = useState("interactive");
  const [epoch, setEpoch] = useState(0);
  const stored = useRef(initial);
  const request = useCallback<ParticipationFetch>(
    async (path, init) => {
      if (path.endsWith("/attendance"))
        return Response.json({
          revision: 1,
          reportedAt: "2030-10-25T18:00:00Z",
          status: "scheduled",
          writable: true,
          roster: players.map((p) => ({
            personId: p.id,
            displayName: p.name,
            role: "participant",
            response: "accepted",
            present: true,
          })),
          candidates: [],
          groups: [],
          history: [],
        });
      if (path.includes("/capabilities"))
        return Response.json(
          init?.method === "PUT"
            ? { ok: true }
            : [
                {
                  key: "greenCard",
                  name: "Gröna kortet",
                  enabled: true,
                  adjustable: true,
                  revision: 1,
                  editable: true,
                },
              ],
        );
      if (path.includes("information-report"))
        return Response.json({
          timeZone: "Europe/Stockholm",
          season: "2030",
          fromDate: "2030-01-01",
          untilDate: "2031-01-01",
          report: {
            teamId: team,
            from: "2030-01-01T00:00:00Z",
            until: "2031-01-01T00:00:00Z",
            players,
            entries: [
              {
                activityId: activity,
                title: "Exempelmatch",
                startsAt: "2030-10-25T16:00:00Z",
                contributions: stored.current,
              },
            ],
          },
        });
      if (init?.method === "PUT") {
        if (mode === "conflict")
          return Response.json(
            {
              error:
                "Uppföljningen har ändrats. Ditt utkast finns kvar. Läs in senaste uppgifter.",
            },
            { status: 409 },
          );
        const command = z
          .object({
            answers: z.array(
              z.object({
                ownerKey: z.string(),
                revision: z.number(),
                values: z.record(
                  z.string(),
                  z.union([z.string(), z.array(z.string())]),
                ),
              }),
            ),
          })
          .parse(JSON.parse(String(init.body)));
        stored.current = stored.current.map((item) => {
          const answer = command.answers.find(
            (answer) => answer.ownerKey === item.definition.key,
          );
          if (!answer) return item;
          const complete =
            Boolean(answer.values.actualCaptainPersonId) ||
            answer.values.outcome === "none" ||
            (Array.isArray(answer.values.recipientIds) &&
              answer.values.recipientIds.length > 0);
          return {
            ...item,
            revision: item.revision + 1,
            values: answer.values,
            state: complete ? "answered" : "open",
          };
        });
      }
      return Response.json({
        activityId: activity,
        title: "Exempelmatch",
        attendanceRevision: mode === "attendance" ? 0 : 1,
        canManageAttendance: true,
        editable: mode !== "readonly",
        players: mode === "attendance" ? [] : players,
        contributions: stored.current,
        history: [],
      });
    },
    [mode],
  );
  return (
    <section id="information-example">
      <h2>Gemensam matchuppföljning</h2>
      <p>Produktionsformulär och rapport med isolerat exempelunderlag.</p>
      <label>
        Uppföljningsläge
        <select
          value={mode}
          onChange={(event) => {
            setMode(event.target.value);
            stored.current = initial;
            setEpoch((n) => n + 1);
          }}
        >
          <option value="interactive">Delvis och fullständigt svar</option>
          <option value="attendance">Närvaro saknas</option>
          <option value="conflict">Revisionskonflikt</option>
          <option value="readonly">Läsläge</option>
        </select>
      </label>
      <ActivityFollowUp key={epoch} activityId={activity} request={request} />
      <DisciplineFollowUpTools
        key={`tools:${epoch}`}
        teamId={team}
        request={request}
      />
    </section>
  );
}
