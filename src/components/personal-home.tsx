"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Activity } from "../domain/club";
import type { ParticipationFetch } from "./activity-invitation-response";
import type { OverviewItem, OverviewAnswered } from "./personal-overview-types";
import type { NavigationLink } from "./navigation-link";
import { PersonalOverview, overviewNames } from "./personal-overview";
import { TeamCalendar } from "./team-calendar";
import { CalendarFiltersView, useCalendarFilters } from "./calendar-filters";
import { attendanceLabel, calendarMonth, calendarSelection, overviewCalendarScope, type CalendarScope, type CalendarMonth, type LoadCalendarMonth } from "../lib/personal-calendar";
import { needsInvitationResponse } from "../lib/pending-invitations";

export type HomeOrganization = { id:string; name:string; role?:string; href:string };
export type HomeTeam = { id:string; organizationId:string; name:string; roles:string[]; href:string };
export const organizationRoleLabels: Record<string,string> = { owner:"Ägare", admin:"Föreningsadministratör", leader:"Ledare", member:"Medlem" };
export const teamRoleLabels: Record<string,string> = { guardian:"Målsman", representative:"Ombud", leader:"Ledare", participant:"Spelare", member:"Medlem", team_access:"Lagåtkomst" };

/** Complete personal page shared by Next and the Kotlin browser frontend. */
export function PersonalHome<T extends OverviewItem>({ items, activities, organizations, teams, referenceTime, onOpenActivity, onAnswered, request, actions, teamContent, linkComponent:Link = "a", title="Min översikt", introduction="Din och barnens vardag – alla lag och föreningar på samma plats.", accountId, calendarScope, loadCalendarMonth }: {
  accountId?:string; calendarScope?:CalendarScope; loadCalendarMonth?:LoadCalendarMonth<T>;
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
  const [month, setMonth] = useState(() => calendarMonth(referenceTime));
  const [attempt, setAttempt] = useState(0);
  const [calendar, setCalendar] = useState<{ month: string; loader: LoadCalendarMonth<T>; data?: CalendarMonth<T>; error?: boolean }>();
  const [filters, saveFilters] = useCalendarFilters(accountId);
  useEffect(() => {
    if (view !== "calendar" || !loadCalendarMonth) return;
    const controller = new AbortController();
    loadCalendarMonth(month, controller.signal).then(data => {
      if (!controller.signal.aborted) setCalendar({ month, loader: loadCalendarMonth, data });
    }).catch(() => {
      if (!controller.signal.aborted) setCalendar({ month, loader: loadCalendarMonth, error: true });
    });
    return () => controller.abort();
  }, [view, month, attempt, loadCalendarMonth, referenceTime]);
  const fallbackScope = calendarScope ?? overviewCalendarScope(items, activities);
  const monthData = calendar?.month === month && calendar.loader === loadCalendarMonth ? calendar.data : undefined;
  const sourceItems = view === "calendar" && loadCalendarMonth ? monthData?.items ?? [] : items;
  const sourceActivities = view === "calendar" && loadCalendarMonth ? monthData?.activities ?? [] : activities;
  const scope = monthData ?? calendarScope ?? fallbackScope;
  const selection = calendarSelection(sourceItems, sourceActivities, scope, filters);
  const pendingIds = new Set(sourceItems.filter(item => needsInvitationResponse(item, referenceTime)).map(item => item.activity.id));
  const pendingCount = new Set(selection.items.filter(item => pendingIds.has(item.activity.id)).map(item => item.activity.id)).size;
  const filteredItems = selection.items.filter(item => !needsReply || pendingIds.has(item.activity.id))
    .sort((left, right) => Date.parse(left.activity.startsAt) - Date.parse(right.activity.startsAt));
  const visibleIds = new Set(filteredItems.map(item => item.activity.id));
  const filteredActivities = sourceActivities.filter(activity => visibleIds.has(activity.id));
  const personNames = overviewNames([...items, ...sourceItems]);
  const byId = new Map(filteredItems.map(item => [item.activity.id, item]));
  const peopleByActivity = new Map<string, T[]>();
  for (const item of filteredItems) {
    const group = peopleByActivity.get(item.activity.id) ?? [];
    if (!group.some(person => person.member.id === item.member.id)) group.push(item);
    peopleByActivity.set(item.activity.id, group);
  }
  const failed = Boolean(loadCalendarMonth && calendar?.month === month && calendar.loader === loadCalendarMonth && calendar.error);
  const loading = Boolean(loadCalendarMonth && !monthData && !failed);
  const emptyMessage = needsReply ? "Inga kallelser i urvalet behöver svar just nu." : "Inga kommande aktiviteter i dina eller barnens lag.";
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
        <CalendarFiltersView scope={scope} teams={selection.teams} value={selection.filters} onChange={saveFilters} />
      </div>
      <p className="sr-only" role="status">{visibleIds.size} aktiviteter visas{needsReply ? " som behöver svar" : ""}.</p>
      {view==="agenda" ? <PersonalOverview activities={filteredItems} timeZone="Europe/Stockholm" title="Kommande aktiviteter" id="upcoming-activities-title" emptyMessage={emptyMessage} referenceTime={referenceTime} onOpenActivity={onOpenActivity} onAnswered={onAnswered} request={request} onRespond={respond} pendingInvitations={pendingInvitations} personNames={personNames} /> : <>
        <p className="personal-calendar-zone">Familjens kalender · tider i svensk tid.</p>
        <TeamCalendar activities={filteredActivities} timeZone="Europe/Stockholm" heading="Familjens kalender" showAllEvents focusToday referenceTime={referenceTime} month={month} onMonthChange={setMonth} busy={loading}
          onSelectActivity={activity=>{const item=byId.get(activity.id);if(item)onOpenActivity(item);}}
          eventLabel={activity => { const item = byId.get(activity.id); return `${activity.title} · ${item?.organization?.name ?? ""} · ${item?.team.name ?? ""}${activity.status === "cancelled" ? " · Inställd" : ""}`; }}
          eventContent={activity => activity.status === "cancelled" ? null : <span className="calendar-attendance">{(peopleByActivity.get(activity.id) ?? []).filter(item => !item.activityOnly).map(item => {
            const attendance = attendanceLabel(item, referenceTime);
            return <span key={item.member.id} data-attendance={attendance?.status}>{personNames.get(item.member.id) ?? item.member.displayName}{attendance ? `: ${attendance.text}` : ""}</span>;
          })}</span>} />
        {loading ? <p role="status">Laddar aktiviteter för vald månad…</p> : failed ? <div role="alert"><p>Aktiviteterna kunde inte hämtas.</p><button className="secondary" type="button" onClick={() => { setCalendar(undefined); setAttempt(value => value + 1); }}>Försök igen</button></div> : !filteredActivities.length ? <p className="overview-empty">Inga aktiviteter för valt urval denna månad</p> : null}
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
