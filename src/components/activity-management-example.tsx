"use client";

import { useCallback, useRef, useState } from "react";
import { z } from "zod";
import { previewRuleWeeklySeries } from "../lib/activity-series";
import { normalizeActivityTimingRules } from "../lib/activity-time-rules";
import { ActivityManagement } from "./activity-management";
import { TeamActivityActions } from "./team-activity-actions";
import type { ParticipationFetch } from "./activity-invitation-response";

const team = {
  id: "11111111-1111-4111-8111-111111111111", organizationId: "22222222-2222-4222-8222-222222222222",
  name: "Exempellaget", organizationName: "Exempelföreningen", timeZone: "Europe/Stockholm", canManageInvitations: true,
};
const initial = {
  id: "33333333-3333-4333-8333-333333333333", organization_id: team.organizationId, team_id: team.id,
  activity_type_id: "00000000-0000-4000-8000-000000000004", title: "Exempelaktivitet", description: "Ta med vattenflaska.",
  location: "Planen", starts_at: "2030-10-25T16:00:00Z", ends_at: "2030-10-25T17:30:00Z", gathering_at: null as string | null,
  status: "scheduled", revision: 0,
};

/** The real management view/editor, with writes confined to this component's fixtures. */
export function ActivityManagementExample() {
  const activities = useRef([initial]);
  const [state, setState] = useState("interactive");
  const [openFromTeam, setOpenFromTeam] = useState(false);
  const request = useCallback<ParticipationFetch>(async (path, init) => {
    if (state === "loading") return new Promise<Response>(resolve => {
      init?.signal?.addEventListener("abort", () => resolve(Response.json([])), { once: true });
    });
    if (state === "error") return Response.json({ error: "Exempel på serverfel" }, { status: 503 });
    if (state === "empty") return Response.json([]);
    if (path === "/api/me/managed-teams") return Response.json([team]);
    if (init?.method === "DELETE") {
      activities.current = activities.current.map(activity => activity.id === path.split("/").at(-1)
        ? { ...activity, status: "cancelled", revision: activity.revision + 1 } : activity);
      return Response.json({ disposition: "cancelled" });
    }
    if (path === "/api/activity-series") {
      const command = z.object({ title: z.string(), description: z.string(), location: z.string(),
        startsOn: z.string(), endsOn: z.string(), startTime: z.string(), timeZone: z.string(),
        weekdays: z.array(z.number()), timingRules: z.unknown(), activityTypeId: z.uuid(),
      }).parse(JSON.parse(String(init?.body)));
      const occurrences = previewRuleWeeklySeries({ ...command, rules: normalizeActivityTimingRules(command.timingRules) });
      const created = occurrences.map(occurrence => ({ ...initial, id: crypto.randomUUID(),
        title: command.title, description: command.description, location: command.location,
        activity_type_id: command.activityTypeId, starts_at: occurrence.startsAt,
        ends_at: occurrence.endsAt, gathering_at: occurrence.gatheringAt,
      }));
      activities.current = [...activities.current, ...created];
      return Response.json({ seriesId: crypto.randomUUID(), count: created.length, activities: created }, { status: 201 });
    }
    if (init?.method === "POST" || init?.method === "PUT") {
      const command = z.object({ title: z.string(), description: z.string().default(""), location: z.string(),
        startsAt: z.string(), endsAt: z.string(), gatheringAt: z.string().nullable(),
        activityTypeId: z.uuid(), revision: z.number().optional(),
      }).parse(JSON.parse(String(init.body)));
      const id = init.method === "POST" ? crypto.randomUUID() : z.uuid().parse(path.split("/").at(-1));
      const saved = { ...initial, id, title: command.title, description: command.description, location: command.location,
        starts_at: command.startsAt, ends_at: command.endsAt, gathering_at: command.gatheringAt,
        activity_type_id: command.activityTypeId, revision: (command.revision ?? -1) + 1 };
      activities.current = [...activities.current.filter(activity => activity.id !== id), saved];
      return Response.json({ activity: saved }, { status: init.method === "POST" ? 201 : 200 });
    }
    return Response.json({ team, disciplineKey: null, sectionId: null, defaults: [], groups: [],
      types: [{ id: initial.activity_type_id, name: "Övrigt", slug: "ovrigt", system_category: "other", organization_id: null }],
      members: [{ id: "44444444-4444-4444-8444-444444444444", displayName: "Alex Exempel", role: "participant" }],
      activities: activities.current,
    });
  }, [state]);
  return <section id="activity-management-example"><h2>Aktivitetshantering</h2>
    <p>Lokalt exempel: skapa, redigera och ställ in utan att skriva till verksamheten.</p>
    <label>Exempeltillstånd<select value={state} onChange={event => { setState(event.target.value); setOpenFromTeam(false); }}>
      <option value="interactive">Skapa, redigera och ställ in</option>
      <option value="loading">Laddning</option><option value="error">Serverfel</option>
      <option value="empty">Ingen lagbehörighet</option>
    </select></label>
    <ActivityManagement key={state} request={request} teamId={team.id} />
    <h3>Redigera från en öppnad aktivitet</h3>
    <ActivityManagement key={`details-${state}`} request={request} teamId={team.id} activityId={initial.id} />
    <h3>Äldre direktlänk med förvalt lag</h3>
    <div className="welcome"><div><h3>{team.name}</h3><p>Skapa direkt från lagets översikt.</p></div>
      <TeamActivityActions key={state} teamId={team.id} request={request} onCreate={() => setOpenFromTeam(true)} />
    </div>
    <ActivityManagement key={`${state}-${openFromTeam}`} request={request}
      initialTeamId={openFromTeam ? team.id : undefined} createOnLoad={openFromTeam} />
  </section>;
}
