"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { createPortal } from "react-dom";
import { ActivityEditButton } from "./activity-edit-button";
import { ActivityEditorModal } from "./activity-editor-modal";
import type { Activity, Member, Organization, Team } from "../domain/club";
import { normalizeDefaultsPatch, resolveDisciplineDefaults } from "../lib/discipline-defaults";
import type { ActivityConfiguration } from "../lib/activity-configuration";
import type { ParticipationFetch } from "./activity-invitation-response";

const teamSchema = z.object({
  id: z.uuid(), organizationId: z.uuid(), name: z.string(), organizationName: z.string(),
  timeZone: z.string(), canManageInvitations: z.boolean(),
});
const activitySchema = z.object({
  id: z.uuid(), organization_id: z.uuid(), team_id: z.uuid(), activity_type_id: z.uuid().nullable(),
  title: z.string(), description: z.string(), location: z.string(), starts_at: z.string(),
  ends_at: z.string(), gathering_at: z.string().nullable(), status: z.enum(["scheduled", "cancelled"]), revision: z.number(),
});
const contextSchema = z.object({
  team: teamSchema,
  types: z.array(z.object({ id: z.uuid(), name: z.string(), slug: z.string(), system_category: z.enum(["work", "session", "competition", "meeting", "education", "other"]), organization_id: z.uuid().nullable() })),
  members: z.array(z.object({ id: z.uuid(), displayName: z.string(), role: z.enum(["leader", "participant"]) })),
  disciplineKey: z.string().nullable(), sectionId: z.uuid().nullable(),
  defaults: z.array(z.object({ id: z.uuid(), activityTypeId: z.uuid(), scope: z.enum(["section", "team"]),
    scopeId: z.uuid(), disciplineKey: z.string(), version: z.string(), revision: z.number(), valuesJson: z.string() })),
  groups: z.array(z.object({ id: z.uuid(), name: z.string(), kind: z.enum(["group", "responsibility"]), personIds: z.array(z.uuid()) })),
  activities: z.array(activitySchema),
});
type EditorContext = z.infer<typeof contextSchema>;
const commandSchema = z.object({
  teamId: z.uuid().optional(), activityTypeId: z.uuid().optional(), title: z.string(),
  description: z.string(), location: z.string(), startsAt: z.string(), endsAt: z.string(),
  gatheringAt: z.string().nullable(), timingRules: z.unknown().optional(),
  invitationMode: z.enum(["none", "now", "schedule"]), invitationAudience: z.string().optional(),
  invitationSelection: z.unknown().optional(), personIds: z.array(z.uuid()).optional(), revision: z.number().optional(),
});


function configuration(context: EditorContext): ActivityConfiguration {
  const disciplineKey = context.disciplineKey ?? "common";
  const types = context.types.map(type => {
    const defaultsContext = {
      activityTypeId: type.id, organizationId: context.team.organizationId,
      sectionId: context.sectionId ?? "", teamId: context.team.id,
      disciplineId: disciplineKey, disciplineKey,
      activityTypeSlug: type.slug, activityCategory: type.system_category,
    };
    const rows = context.defaults.map(row => ({ ...row,
      organizationId: context.team.organizationId, disciplineId: row.disciplineKey,
      values: normalizeDefaultsPatch(JSON.parse(row.valuesJson), defaultsContext),
    }));
    return { ...type, active: true, discipline_id: null,
      defaults: resolveDisciplineDefaults(defaultsContext, rows),
    };
  });
  return {
    team: { id: context.team.id, organization_id: context.team.organizationId, section_id: context.sectionId ?? "" },
    disciplineId: disciplineKey, disciplineKey, disciplinePackage: null,
    timeZone: context.team.timeZone, types,
  };
}

/** The existing editor uses the account-bound Kotlin transport, without page reloads. */
export function ActivityManagement({ request, teamId, activityId, onSaved, initialTeamId = "", createOnLoad = false, onEditorClose }: {
  request: ParticipationFetch; teamId?: string; activityId?: string; onSaved?: () => void;
  initialTeamId?: string; createOnLoad?: boolean; onEditorClose?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const [teams, setTeams] = useState<z.infer<typeof teamSchema>[]>();
  const [context, setContext] = useState<EditorContext>();
  const [chosenTeam, setSelectedTeam] = useState(initialTeamId);
  const selectedTeam = teamId ?? chosenTeam;
  const canManageTeam = teams?.some(team => team.id === selectedTeam) ?? false;
  const [editing, setEditing] = useState<"create" | z.infer<typeof activitySchema> | undefined>(createOnLoad ? "create" : undefined);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    request("/api/me/managed-teams", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Lagen kunde inte hämtas.");
      return z.array(teamSchema).parse(await response.json());
    }).then(data => { if (!controller.signal.aborted) setTeams(data); })
      .catch(() => { if (!controller.signal.aborted) setError("Lagen kunde inte hämtas. Försök igen."); });
    return () => controller.abort();
  }, [request, attempt]);

  useEffect(() => {
    if (!selectedTeam || !canManageTeam) return;
    const controller = new AbortController();
    request(`/api/teams/${selectedTeam}/activity-editor`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Aktiviteterna kunde inte hämtas.");
      return contextSchema.parse(await response.json());
    }).then(data => { if (!controller.signal.aborted) { setContext(data); setError(undefined); } })
      .catch(() => { if (!controller.signal.aborted) { setContext(undefined); setError("Aktiviteterna kunde inte hämtas. Kontrollera din behörighet och försök igen."); } });
    return () => controller.abort();
  }, [request, selectedTeam, canManageTeam, attempt]);

  const editorRequest = useCallback(async (path: string, init?: RequestInit) => {
    if (!context) throw new Error("Välj ett lag först.");
    if (path.startsWith("/api/activity-configuration?")) return Response.json(configuration(context));
    if (path.startsWith("/api/team-groups?")) return Response.json({
      groups: context.groups.filter(group => group.kind === "group"),
      responsibilities: context.groups.filter(group => group.kind === "responsibility"),
    });
    if (path === "/api/activity-series") return request(path, init);
    if (init?.method === "POST" || init?.method === "PUT") {
      const command = commandSchema.parse(JSON.parse(String(init.body)));
      return request(path, { ...init, body: JSON.stringify(command) });
    }
    return request(path, init);
  }, [context, request]);

  let editor;
  if (context && editing) {
    const current = editing === "create" ? undefined : editing;
    const organization: Organization = { id: context.team.organizationId, name: context.team.organizationName,
      slug: "", assistantName: "", timeZone: context.team.timeZone };
    const team: Team = { id: context.team.id, organizationId: organization.id, name: context.team.name,
      sectionId: "", slug: "", season: "" };
    const members: Member[] = context.members.map(member => ({ ...member, organizationId: organization.id,
      teamRelation: member.role === "leader" ? "leader" : "player" }));
    const activity: Activity | undefined = current ? { id: current.id, organizationId: current.organization_id,
      teamId: current.team_id, activityTypeId: current.activity_type_id ?? undefined, title: current.title,
      description: current.description, location: current.location, startsAt: current.starts_at, endsAt: current.ends_at,
      gatheringAt: current.gathering_at ?? undefined, status: current.status === "scheduled" ? "published" : "cancelled" } : undefined;
    editor = <ActivityEditorModal key={current?.id ?? "create"} mode={current ? "edit" : "create"}
      organization={organization} team={team} activity={activity} members={members} source="database"
      canManageInvitations={context.team.canManageInvitations}
      onClose={() => { setEditing(undefined); onEditorClose?.(); }} onNotice={setNotice}
      adapter={{ request: editorRequest, revision: current?.revision,
        onSaved: () => { setAttempt(value => value + 1); onSaved?.(); } }} />;
  }

  if (teamId && teams && !canManageTeam) return null;

  const selectedActivity = context?.activities.find(item => item.id === activityId);
  const canEditActivity = selectedActivity?.status === "scheduled" && Date.parse(selectedActivity.ends_at) > now;

  return <section className="club-administration activity-management" aria-label="Hantera aktiviteter">
    {!teamId ? <h1>Hantera aktiviteter</h1> : null}
    {error ? <p role="alert">{error} <button type="button" onClick={() => setAttempt(value => value + 1)}>Försök igen</button></p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {teamId ? null : !teams ? <p role="status">Laddar lag…</p> : teams.length === 0 ? <p>Du saknar behörighet att hantera aktiviteter i något lag.</p> : <label>Lag<select value={selectedTeam} onChange={event => {
      setSelectedTeam(event.target.value); setContext(undefined); setEditing(undefined); setNotice(undefined);
    }}><option value="">Välj lag</option>{teams.map(team => <option key={team.id} value={team.id}>{team.organizationName} · {team.name}</option>)}</select></label>}
    {selectedTeam && teams && !canManageTeam ? <p>Du saknar behörighet att hantera aktiviteter i det valda laget. Välj ett annat lag.</p>
      : selectedTeam && !context && !error ? <p role="status">Laddar aktiviteter…</p> : null}
    {context ? <>
      {activityId ? canEditActivity ? <ActivityEditButton onClick={() => setEditing(selectedActivity)} /> : null
        : <button type="button" className="primary" aria-label="Ny aktivitet" onClick={() => setEditing("create")}>Ny aktivitet</button>}
      {!teamId && !activityId ? context.activities.length === 0 ? <p>Inga aktiviteter ännu.</p> : <ul>{context.activities.map(activity => <li key={activity.id}>
        <strong>{activity.title}</strong> · {new Intl.DateTimeFormat("sv-SE", { timeZone: context.team.timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(activity.starts_at))}
        {activity.status === "cancelled" ? <span> · Inställd</span> : Date.parse(activity.ends_at) > now ? <button type="button" className="secondary" onClick={() => setEditing(activity)}>Redigera {activity.title}</button> : <span> · Avslutad</span>}
      </li>)}</ul> : null}
    </> : null}
    {editor ? createPortal(editor, document.body) : null}
  </section>;
}
