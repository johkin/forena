"use client";

import { useRef, useState, type ReactNode } from "react";
import type { Activity } from "../domain/club";
import type { ParticipationFetch } from "./activity-invitation-response";
import type { OverviewItem, OverviewAnswered } from "./personal-overview-types";
import type { NavigationLink } from "./navigation-link";
import { PersonalOverview, overviewNames } from "./personal-overview";
import { TeamCalendar } from "./team-calendar";

export type HomeOrganization = { id:string; name:string; role?:string; href:string };
export type HomeTeam = { id:string; organizationId:string; name:string; roles:string[]; href:string };
export const organizationRoleLabels: Record<string,string> = { owner:"Ägare", admin:"Föreningsadministratör", leader:"Ledare", member:"Medlem" };
export const teamRoleLabels: Record<string,string> = { guardian:"Målsman", representative:"Ombud", leader:"Ledare", participant:"Spelare", member:"Medlem", team_access:"Lagåtkomst" };

/** Complete personal page shared by Next and the Kotlin browser frontend. */
export function PersonalHome<T extends OverviewItem>({ items, activities, organizations, teams, referenceTime, onOpenActivity, onAnswered, request, actions, teamContent, linkComponent:Link = "a", title="Min översikt", introduction="Din och barnens vardag – alla lag och föreningar på samma plats." }: {
  items:T[]; activities:Activity[]; organizations:HomeOrganization[]; teams:HomeTeam[]; referenceTime:string;
  onOpenActivity:(item:T)=>void; onAnswered?:OverviewAnswered; request?:ParticipationFetch; linkComponent?:NavigationLink;
  title?:string; introduction?:string; actions?:ReactNode; teamContent?:ReactNode;
}) {
  const writing=useRef(new Set<string>());
  const [pendingInvitations,setPendingInvitations]=useState<ReadonlySet<string>>(new Set());
  async function respond(id:string,response:"accepted"|"declined") {
    if(writing.current.has(id))return false;
    writing.current.add(id);setPendingInvitations(new Set(writing.current));
    try {
      const result=await (request ?? fetch)(`/api/invitations/${encodeURIComponent(id)}/respond`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({response})});
      if(!result.ok)throw new Error("Svaret kunde inte sparas.");
      return true;
    } finally {writing.current.delete(id);setPendingInvitations(new Set(writing.current));}
  }
  const [view,setView]=useState<"agenda"|"calendar">("agenda");
  const [needsReply, setNeedsReply] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>();
  const now=Date.parse(referenceTime);
  const pendingIds=new Set(items.filter(item=>item.activity.status !== "cancelled" && item.invitation?.response==="pending" && Date.parse(item.activity.startsAt)>now && (!item.activity.responseDueAt || Date.parse(item.activity.responseDueAt)>now)).map(item=>item.activity.id));
  const activityById = new Map(activities.map(activity => [activity.id, activity]));
  // Include guest invitations and managed activities even without a team shortcut.
  const filterTeams = new Map<string, string>();
  for (const item of items) {
    const activity = activityById.get(item.activity.id);
    if (activity) filterTeams.set(activity.teamId, [item.organization?.name, item.team.name].filter(Boolean).join(" · "));
  }
  const activeTeamId = selectedTeamId && filterTeams.has(selectedTeamId) ? selectedTeamId : undefined;
  const teamItems = items.filter(item => !activeTeamId || activityById.get(item.activity.id)?.teamId === activeTeamId);
  const pendingCount = new Set(teamItems.filter(item => pendingIds.has(item.activity.id)).map(item => item.activity.id)).size;
  const filteredItems = teamItems.filter(item => !needsReply || pendingIds.has(item.activity.id))
    .sort((left, right) => Date.parse(left.activity.startsAt) - Date.parse(right.activity.startsAt));
  const visibleIds = new Set(filteredItems.map(item => item.activity.id));
  const filteredActivities = activities.filter(activity => visibleIds.has(activity.id));
  const emptyMessage = needsReply ? "Alla aktuella kallelser i urvalet är besvarade."
    : activeTeamId ? "Inga kommande aktiviteter för det valda laget." : "Inga kommande aktiviteter i dina eller barnens lag.";
  const personNames=overviewNames(items);
  const byId=new Map(items.map(item=>[item.activity.id,item]));
  const namesById=new Map<string,string[]>();
  for(const item of items){const names=namesById.get(item.activity.id) ?? [];names.push(item.member.displayName);namesById.set(item.activity.id,names);}
  return <>
    <div className="welcome"><div><p className="eyebrow">Förena · Personligt</p><h1>{title}</h1><p>{introduction}</p></div>{actions}</div>
    {teamContent}
    <div className="personal-calendar-section">
      <div className="personal-view-switch segmented-control" role="group" aria-label="Visning av familjens aktiviteter">
        <button type="button" aria-pressed={view==="agenda"} onClick={()=>setView("agenda")}>Agenda</button>
        <button type="button" aria-pressed={view==="calendar"} onClick={()=>setView("calendar")}>Kalender</button>
      </div>
      <div className="personal-activity-filters">
        <div role="group" aria-label="Svarsfilter">
          <button className="personal-filter-chip" type="button" aria-pressed={needsReply} onClick={() => setNeedsReply(value => !value)}>Behöver svar ({pendingCount})</button>
        </div>
        <div className="personal-team-filters" role="group" aria-label="Filtrera på lag">
          <button className="personal-filter-chip" type="button" aria-pressed={!activeTeamId} onClick={() => setSelectedTeamId(undefined)}>Alla lag</button>
          {[...filterTeams].map(([id, label]) => <button className="personal-filter-chip" key={id} type="button" aria-pressed={activeTeamId === id} onClick={() => setSelectedTeamId(id)}>{label}</button>)}
        </div>
      </div>
      <p className="sr-only" role="status">{visibleIds.size} aktiviteter visas{needsReply ? " som behöver svar" : ""}.</p>
      {view==="agenda" ? <PersonalOverview activities={filteredItems} timeZone="Europe/Stockholm" title="Kommande aktiviteter" id="upcoming-activities-title" emptyMessage={emptyMessage} referenceTime={referenceTime} onOpenActivity={onOpenActivity} onAnswered={onAnswered} request={request} onRespond={respond} pendingInvitations={pendingInvitations} personNames={personNames} /> : <>
        <p className="personal-calendar-zone">Familjens kalender · tider i svensk tid. Samma filter som i agendan.</p>
        <TeamCalendar activities={filteredActivities} timeZone="Europe/Stockholm" heading="Familjens kalender" showAllEvents
          onSelectActivity={activity=>{const item=byId.get(activity.id);if(item)onOpenActivity(item);}}
          eventLabel={activity=>{const item=byId.get(activity.id);return `${activity.title} · ${item?.organization?.name ?? ""} · ${item?.team.name ?? ""} · ${(namesById.get(activity.id) ?? []).join(", ")}`;}} />
        {!filteredActivities.length ? <p className="overview-empty">{emptyMessage}</p> : null}
      </>}
    </div>
    <section className="card" aria-labelledby="my-teams-title"><h2 id="my-teams-title">Mina lag och föreningar</h2>
      <div className="personal-workspaces">{organizations.map(organization=><div key={organization.id}>
        <h3><Link href={organization.href}>{organization.name}</Link></h3>
        {organization.role ? <p className="personal-organization-role">{organizationRoleLabels[organization.role] ?? organization.role}</p> : null}
        {teams.filter(team=>team.organizationId===organization.id).map(team=><Link className="personal-team-link" key={team.id} href={team.href}><strong>{team.name}</strong><span>{team.roles.join(" · ")}</span><span aria-hidden="true">→</span></Link>)}
      </div>)}</div>
      {!organizations.length ? <p>Du är inte ansluten till någon förening ännu. Be din förening om en ansöknings- eller inbjudningslänk.</p> : null}
    </section>
  </>;
}
