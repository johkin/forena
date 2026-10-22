"use client";

import { useRef, useState } from "react";
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
export function PersonalHome<T extends OverviewItem>({ items, activities, organizations, teams, referenceTime, onOpenActivity, onAnswered, request, linkComponent:Link = "a", title="Min översikt", introduction="Din och barnens vardag – alla lag och föreningar på samma plats." }: {
  items:T[]; activities:Activity[]; organizations:HomeOrganization[]; teams:HomeTeam[]; referenceTime:string;
  onOpenActivity:(item:T)=>void; onAnswered?:OverviewAnswered; request?:ParticipationFetch; linkComponent?:NavigationLink;
  title?:string; introduction?:string;
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
  const now=Date.parse(referenceTime);
  const pendingIds=new Set(items.filter(item=>item.invitation?.response==="pending" && Date.parse(item.activity.startsAt)>now && (!item.activity.responseDueAt || Date.parse(item.activity.responseDueAt)>now)).map(item=>item.activity.id));
  const pending=items.filter(item=>pendingIds.has(item.activity.id));
  const personNames=overviewNames(items);
  const byId=new Map(items.map(item=>[item.activity.id,item]));
  const namesById=new Map<string,string[]>();
  for(const item of items){const names=namesById.get(item.activity.id) ?? [];names.push(item.member.displayName);namesById.set(item.activity.id,names);}
  return <>
    <div className="welcome"><div><p className="eyebrow">Förena · Personligt</p><h1>{title}</h1><p>{introduction}</p></div></div>
    <PersonalOverview activities={pending} timeZone="Europe/Stockholm" title="Behöver svar" id="pending-activities-title" emptyMessage="Alla aktuella kallelser är besvarade." referenceTime={referenceTime} onOpenActivity={onOpenActivity} onAnswered={onAnswered} request={request} onRespond={respond} pendingInvitations={pendingInvitations} personNames={personNames} />
    <div className="personal-calendar-section">
      <div className="personal-view-switch segmented-control" role="group" aria-label="Visning av familjens aktiviteter">
        <button type="button" aria-pressed={view==="agenda"} onClick={()=>setView("agenda")}>Agenda</button>
        <button type="button" aria-pressed={view==="calendar"} onClick={()=>setView("calendar")}>Kalender</button>
      </div>
      {view==="agenda" ? <PersonalOverview activities={items} timeZone="Europe/Stockholm" title="Kommande aktiviteter" id="upcoming-activities-title" emptyMessage="Inga kommande aktiviteter i dina eller barnens lag." referenceTime={referenceTime} onOpenActivity={onOpenActivity} onAnswered={onAnswered} request={request} onRespond={respond} pendingInvitations={pendingInvitations} personNames={personNames} /> : <>
        <p className="personal-calendar-zone">Familjens kalender · tider i svensk tid. Alla föreningar visas.</p>
        <TeamCalendar activities={activities} timeZone="Europe/Stockholm" heading="Familjens kalender" showAllEvents
          onSelectActivity={activity=>{const item=byId.get(activity.id);if(item)onOpenActivity(item);}}
          eventLabel={activity=>{const item=byId.get(activity.id);return `${activity.title} · ${item?.organization?.name ?? ""} · ${item?.team.name ?? ""} · ${(namesById.get(activity.id) ?? []).join(", ")}`;}} />
        {!activities.length ? <p className="overview-empty">Inga kommande aktiviteter för familjen.</p> : null}
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
