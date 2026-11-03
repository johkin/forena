"use client";

import { useCallback, useRef } from "react";
import { z } from "zod";
import { DisciplineCatalogue } from "./discipline-catalogue";
import { ActivityDefaultsAdministration } from "./activity-defaults-administration";
import {
  TeamCapabilitySignals,
  TeamDisciplinePlayers,
} from "./team-capability-signals";
import { TeamFollowUp } from "./team-follow-up";
import type { ParticipationFetch } from "./activity-invitation-response";
const team = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const organization = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const activity = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const signal = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const categorySchema = z.object({ key: z.string(), name: z.string() });
const disciplineSchema = z.object({
  key: z.string(),
  name: z.string(),
  category: z.string(),
  codeOwned: z.boolean().default(false),
  packageVersion: z.string().nullable().default(null),
});
const rowSchema = z.object({
  activityTypeId: z.uuid(),
  revision: z.number(),
  values: z.record(z.string(), z.unknown()),
});
const type = {
  id: "00000000-0000-4000-8000-000000000002",
  name: "Match/tävling",
  slug: "match-tavling",
  system_category: "competition",
  organization_id: null,
};
export function DisciplineAdministrationExamples() {
  const categories = useRef([
    categorySchema.parse({ key: "sport", name: "Sport" }),
    categorySchema.parse({ key: "culture", name: "Kultur" }),
  ]);
  const disciplines = useRef([
    disciplineSchema.parse({
      key: "football",
      name: "Fotboll",
      category: "sport",
      codeOwned: true,
      packageVersion: "1.0.0",
    }),
    disciplineSchema.parse({ key: "choir", name: "Kör", category: "culture" }),
  ]);
  const rows = useRef<z.infer<typeof rowSchema>[]>([]);
  const dismissed = useRef(false);
  const reminder = useRef(false);
  const request = useCallback<ParticipationFetch>(async (path, init) => {
    if (path.includes("discipline-catalogue")) {
      if (init?.method && init.method !== "GET") {
        const key = decodeURIComponent(path.split("/").at(-1) ?? "");
        if (path.includes("/categories/")) {
          categories.current = categories.current.filter(
            (item) => item.key !== key,
          );
          if (init.method !== "DELETE")
            categories.current.push(
              categorySchema.parse(JSON.parse(String(init.body))),
            );
        } else {
          disciplines.current = disciplines.current.filter(
            (item) => item.key !== key,
          );
          if (init.method !== "DELETE")
            disciplines.current.push(
              disciplineSchema.parse(JSON.parse(String(init.body))),
            );
        }
      }
      return Response.json({
        categories: categories.current,
        disciplines: disciplines.current,
      });
    }
    if (path.includes("activity-defaults")) {
      if (init?.method === "PUT") {
        const command = rowSchema.parse(JSON.parse(String(init.body)));
        rows.current = [{ ...command, revision: command.revision + 1 }];
      }
      return Response.json({
        organizationId: organization,
        scope: "team",
        scopeId: team,
        sectionId: null,
        disciplineKey: "football",
        version: "1.0.0",
        types: [type],
        rows: rows.current.map((row) => ({
          id: team,
          scope: "team",
          scopeId: team,
          disciplineKey: "football",
          version: "1.0.0",
          activityTypeId: row.activityTypeId,
          revision: row.revision,
          valuesJson: JSON.stringify(row.values),
        })),
      });
    }
    if (path.includes("/actions")) {
      const command = z
        .object({ action: z.string() })
        .parse(JSON.parse(String(init?.body)));
      if (command.action === "dismiss") dismissed.current = true;
      else reminder.current = true;
      return Response.json({ ok: true });
    }
    if (path.endsWith("/signals"))
      return Response.json([
        {
          id: signal,
          activityId: activity,
          state: dismissed.current ? "dismissed" : "active",
          severity: "warning",
          title: "Få spelare anmälda till matchen",
          text: "6 av önskade 10 spelare har tackat ja. 3 spelare har ännu inte svarat.",
          actions: reminder.current
            ? []
            : ["remind-unanswered", "invite-more-players"],
          revision: 1,
          episode: 1,
          evaluatedAt: "2030-10-25T10:00:00Z",
          history: reminder.current
            ? [
                {
                  action: "remind-unanswered",
                  result: "queued",
                  createdAt: "2030-10-25T10:00:00Z",
                },
              ]
            : [],
        },
      ]);
    if (path.endsWith("/discipline-players"))
      return Response.json([{ id: team, name: "Alex Exempel" }]);
    if (path.includes("discipline-fields"))
      return Response.json({
        disciplineKey: "football",
        version: "1.0.0",
        enabled: true,
        editable: false,
        canManageInvitations: false,
        title: "Spelaruppgifter",
        fields: [
          {
            key: "shirtNumber",
            title: "Tröjnummer",
            type: "integer",
            read: "team",
            write: "managers",
            minimum: 0,
            maximum: 999,
            options: [],
          },
        ],
        values: { shirtNumber: 7 },
        revision: 1,
        teamPlayers: [],
        acceptedPlayers: [],
        participants: [],
      });
    if (path.endsWith("/follow-up"))
      return Response.json([
        {
          activityId: activity,
          title: "Exempelmatch",
          startsAt: "2030-10-25T16:00:00Z",
          missing: ["Faktisk lagkapten", "Gröna kortet"],
        },
      ]);
    if (path.includes("information-report"))
      return Response.json({
        timeZone: "Europe/Stockholm",
        season: "2030",
        fromDate: "2030-01-01",
        untilDate: "2031-01-01",
        report: {
          teamId: team,
          from: "2029-12-31T23:00:00Z",
          until: "2030-12-31T23:00:00Z",
          players: [],
          entries: [],
        },
      });
    return Response.json({}, { status: 404 });
  }, []);
  return (
    <section id="discipline-administration-example">
      <h2>Disciplinadministration och laguppföljning</h2>
      <p>Gemensamma produktionskomponenter med isolerade exempeldata.</p>
      <DisciplineCatalogue request={request} />
      <ActivityDefaultsAdministration
        request={request}
        scope="team"
        scopeId={team}
      />
      <TeamCapabilitySignals request={request} teamId={team} />
      <TeamFollowUp request={request} teamId={team} />
      <TeamDisciplinePlayers request={request} teamId={team} />
    </section>
  );
}
