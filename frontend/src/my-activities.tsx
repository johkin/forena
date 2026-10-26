import { TeamRosterLink } from "./team-roster";
import { OverviewBackLink } from "../../src/components/overview-back-link";
import { needsInvitationResponse } from "../../src/lib/pending-invitations";
import { useNavigate } from "react-router";
import { AppLink } from "./app-link";
import { useEffect, useRef, useState } from "react";
import { ActivityManagement } from "../../src/components/activity-management";
import { PersonalHome, teamRoleLabels } from "../../src/components/personal-home";
import { PersonalOverview } from "../../src/components/personal-overview";
import type { ParticipationFetch } from "../../src/components/activity-invitation-response";
import { calendarActivity, confirmedAnswer, overviewItems, type Overview } from "./personal-overview";

type Workspace = { kind:"organization"|"team"; id:string };
export function MyActivitiesPage({ request, workspace, notifications=false }: { request:ParticipationFetch; workspace?:Workspace; notifications?:boolean }) {
  const navigate=useNavigate();
  const [data,setData]=useState<Overview>();
  const [attempt,setAttempt]=useState(0);
  const [error,setError]=useState<string>();
  const [saved,setSaved]=useState<string>();
  const revision=useRef(0);
  useEffect(()=>{
    let controller:AbortController|undefined;
    let latest=0;
    const load=()=>{
      controller?.abort(); controller=new AbortController();
      const signal=controller.signal;
      const writeVersion=revision.current;
      const generation=++latest;
      request("/api/me/overview",{signal}).then(async response=>{
        if(!response.ok)throw new Error();return await response.json() as Overview;
      }).then(snapshot=>{if(!signal.aborted && generation===latest && writeVersion===revision.current){setData(snapshot);setError(undefined);}})
        .catch(()=>{if(!signal.aborted && generation===latest && writeVersion===revision.current)setError("Din översikt kunde inte hämtas. Försök igen.");});
    };
    const onVisible=()=>{if(document.visibilityState==="visible")load();};
    const onNotification=(event:MessageEvent)=>{if(event.data?.type==="activity-notification")load();};
    load();
    window.addEventListener("focus",load);
    document.addEventListener("visibilitychange",onVisible);
    navigator.serviceWorker?.addEventListener("message",onNotification);
    const timer=window.setInterval(onVisible,60_000);
    return ()=>{controller?.abort();clearInterval(timer);window.removeEventListener("focus",load);document.removeEventListener("visibilitychange",onVisible);navigator.serviceWorker?.removeEventListener("message",onNotification);};
  },[request,attempt]);
  const header=<div className="welcome"><div><p className="eyebrow">Förena · Personligt</p><h1>Min översikt</h1></div></div>;
  if(!data)return <>{header}{error ? <div role="alert"><p>{error}</p><button type="button" onClick={()=>setAttempt(value=>value+1)}>Försök igen</button></div> : <p role="status">Laddar din översikt…</p>}</>;
  const organization=workspace?.kind==="organization" ? data.organizations.find(item=>item.id===workspace.id) : undefined;
  const team=workspace?.kind==="team" ? data.teams.find(item=>item.id===workspace.id) : undefined;
  if(workspace && !organization && !team)return <><h1>Arbetsytan är inte tillgänglig</h1><p>Du saknar åtkomst eller kopplingen har upphört.</p><OverviewBackLink linkComponent={AppLink} /></>;
  const activities=workspace ? data.activities.filter(item=>team ? item.team.id===team.id : item.organization.id===organization!.id) : data.activities;
  const items=overviewItems(activities);
  const answer=(id:string,response:"accepted"|"declined")=>{
    revision.current++;
    setData(current=>current ? confirmedAnswer(current,id,response) : current);
    setSaved("Ditt svar har sparats.");
    requestAnimationFrame(()=>{
      if(document.activeElement!==document.body)return;
      document.querySelector<HTMLButtonElement>(`[data-invitation-id="${CSS.escape(id)}"] button[data-response="${response}"]`)?.focus();
      if(document.activeElement===document.body)document.querySelector<HTMLElement>("main")?.focus();
    });
  };
  if(notifications){
    const pendingIds = new Set(items.filter(item => needsInvitationResponse(item, data.reference_time)).map(item => item.activity.id));
    return <><OverviewBackLink linkComponent={AppLink} /><h1>Dina kallelser</h1>
      {error ? <p role="alert">{error}</p> : null}
      <PersonalOverview activities={items.filter(item=>pendingIds.has(item.activity.id))} timeZone="Europe/Stockholm" title="Behöver svar" emptyMessage="Inga kallelser att svara på just nu." referenceTime={data.reference_time} onAnswered={answer} onOpenActivity={item=>navigate(`/activities/${item.activity.id}`)} request={request} />
      {saved ? <p className="sr-only" role="status">{saved}</p> : null}
    </>;
  }
  return <>
    {workspace ? <OverviewBackLink linkComponent={AppLink} /> : null}
    {error ? <div role="alert"><p>{error}</p><button type="button" onClick={()=>setAttempt(value=>value+1)}>Försök igen</button></div> : null}
    <PersonalHome items={items} activities={activities.map(calendarActivity)} referenceTime={data.reference_time}
      actions={team ? <><TeamRosterLink key={`roster-${team.id}`} request={request} teamId={team.id} /><ActivityManagement key={team.id} teamId={team.id} request={request} onSaved={() => setAttempt(value => value + 1)} /></> : undefined}
      title={team?.name ?? organization?.name} introduction={workspace ? "Här visas aktiviteter för dig och de personer du företräder i arbetsytan." : undefined}
      organizations={data.organizations.filter(item=>!workspace || item.id===(organization?.id ?? team?.organization_id)).map(item=>({...item,role:item.role ?? undefined,href:`/organizations/${item.id}`}))}
      teams={data.teams.filter(item=>!workspace || (team ? item.id===team.id : item.organization_id===organization!.id)).map(item=>({id:item.id,organizationId:item.organization_id,name:item.name,roles:item.roles.map(role=>teamRoleLabels[role] ?? role),href:`/teams/${item.id}`}))}
      request={request} linkComponent={AppLink} onAnswered={answer} onOpenActivity={item=>navigate(`/activities/${item.activity.id}`)} />
    {saved ? <p className="sr-only" role="status">{saved}</p> : null}
  </>;
}
