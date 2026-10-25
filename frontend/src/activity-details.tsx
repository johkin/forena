import { useEffect, useState } from "react";
import { ActivityManagement } from "../../src/components/activity-management";
import { AppLink } from "./app-link";
import { ActivityInvitationResponse, type ParticipationFetch } from "../../src/components/activity-invitation-response";
import type { PersonalActivity } from "./personal-overview";

export function ActivityDetails({ activityId,request }: { activityId:string; request:ParticipationFetch }) {
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),30_000);return ()=>clearInterval(timer);},[]);
  const [activity,setActivity]=useState<PersonalActivity>();
  const [error,setError]=useState<string>();
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    request(`/api/activities/${activityId}`,{signal:controller.signal}).then(async response=>{
      if(!response.ok)throw new Error(response.status===404 ? "Aktiviteten är inte tillgänglig." : "Aktiviteten kunde inte hämtas. Försök igen.");
      return await response.json() as PersonalActivity;
    }).then(data=>{if(!controller.signal.aborted){setActivity(data);setError(undefined);}})
      .catch((cause:unknown)=>{if(!controller.signal.aborted)setError(cause instanceof Error ? cause.message : "Aktiviteten kunde inte hämtas.");});
    return ()=>controller.abort();
  },[request,activityId,attempt]);
  const links=<p><AppLink href="/">Till min översikt</AppLink></p>;
  if(error)return <>{links}<p role="alert">{error}</p><button type="button" onClick={()=>setAttempt(value=>value+1)}>Försök igen</button></>;
  if(!activity)return <>{links}<p role="status">Laddar aktiviteten…</p></>;
  const when=(value:string)=>new Intl.DateTimeFormat("sv-SE",{timeZone:activity.organization.time_zone,dateStyle:"full",timeStyle:"short"}).format(new Date(value));
  const cancelled=activity.status==="cancelled";
  const ended=Date.parse(activity.ends_at)<=now;
  const invitations=activity.people.some(person=>person.invitation!==null);
  return <>{links}<section className="card activity-details" aria-label="Aktivitetsdetaljer">
    <p className="eyebrow">{activity.organization.name} · {activity.team.name}</p><h2>{activity.title}</h2>
    <p><time dateTime={activity.starts_at}>{when(activity.starts_at)}</time> – <time dateTime={activity.ends_at}>{when(activity.ends_at)}</time></p>
    <p>Tider i {activity.organization.time_zone}.</p>
    {activity.gathering_at ? <p>Samling: <time dateTime={activity.gathering_at}>{when(activity.gathering_at)}</time></p> : null}
    {activity.location ? <p>Plats: {activity.location}</p> : null}
    {activity.description ? <p className="activity-description">{activity.description}</p> : null}
    <ActivityManagement key={activity.id} teamId={activity.team.id} activityId={activity.id} request={request} onSaved={() => setAttempt(value => value + 1)} />
    {activity.response_due_at ? <p>Svara senast: <time dateTime={activity.response_due_at}>{when(activity.response_due_at)}</time></p> : null}
    {ended ? <p role="status">Aktiviteten är avslutad. Svaren kan inte ändras.</p> : null}
    {invitations ? <ActivityInvitationResponse activityId={activityId} cancelled={cancelled} readOnly={ended} request={request} /> : <>
      {cancelled ? <p role="status">Aktiviteten är inställd.</p> : null}
      <div className="personal-activity-people">{activity.people.map(person=><p key={person.id}><strong>{person.name}</strong> · Ingen kallelse ännu.</p>)}</div>
    </>}
  </section></>;
}
