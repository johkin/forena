"use client";
import type { NavigationLink } from "./navigation-link";
import { useCallback, useRef, useState } from "react";
import { PasswordLoginForm } from "./password-login-form";
import { ActivityInvitationResponse, type ParticipationFetch } from "./activity-invitation-response";
import { PersonalHome } from "./personal-home";
import type { OverviewItem } from "./personal-overview-types";
import type { Activity } from "../domain/club";
import { MyActivityList, type MyActivity } from "./my-activity-list";
import { SessionMenu } from "./session-menu";

/** Actual pilot components with local fixtures; no login or database mutations. */
export function BrowserFrontendExamples({ linkComponent }: { linkComponent?: NavigationLink }) {
  const [error, setError] = useState<string>();
  const invitations = useRef([{ id: "11111111-1111-4111-8111-111111111111", person_id: "22222222-2222-4222-8222-222222222222", name: "Alex Exempel", response: "pending", response_comment: null as string | null }]);
  const request = useCallback<ParticipationFetch>(async (path, init) => {
    if (init?.method === "PUT") {
      const change = JSON.parse(String(init.body)) as { response: string; comment?: string };
      invitations.current = invitations.current.map(item => item.id === path.split("/")[3]
        ? { ...item, response: change.response, ...(change.comment !== undefined ? { response_comment: change.comment } : {}) } : item);
      return Response.json({ ok: true });
    }
    return Response.json({ invitations: invitations.current });
  }, []);
  const activities: MyActivity[] = [{ id: "33333333-3333-4333-8333-333333333333", title: "Träning med laget", starts_at: "2030-10-22T16:00:00Z", ends_at: "2030-10-22T17:30:00Z", organization_name: "Exempelföreningen med ett långt namn", team_name: "Ungdomslaget", invitations: [
    { id: "11111111-1111-4111-8111-111111111111", person_id: "22222222-2222-4222-8222-222222222222", name: "Alex Exempel med ett långt familjenamn", response: "pending", response_comment: null },
    { id: "44444444-4444-4444-8444-444444444444", person_id: "55555555-5555-4555-8555-555555555555", name: "Robin Exempel", response: "declined", response_comment: "Bevaras vid snabbsvar" },
  ] }];
  return <>
    <PersonalHomeExample linkComponent={linkComponent} />
    <section><h2>Mina aktiviteter</h2><MyActivityList linkComponent={linkComponent} request={request} activities={activities} loadMore={() => {}} /></section>
    <section><h2>Aktivitet utan utskickad kallelse</h2><MyActivityList linkComponent={linkComponent} activities={[{ ...activities[0], invitations: [] }]} /></section>
    <section><h2>Aktiviteter laddas</h2><MyActivityList linkComponent={linkComponent} activities={[]} loading /></section>
    <section><h2>Tom aktivitetsöversikt</h2><MyActivityList linkComponent={linkComponent} activities={[]} /></section>
    <section><h2>Aktivitetsfel</h2><MyActivityList linkComponent={linkComponent} activities={[]} error="Aktiviteterna kunde inte hämtas." retry={() => {}} /></section>
    <section><h2>Inloggning med lösenord eller passkey</h2><p>Lokalt exempel. Inga inloggningsuppgifter skickas.</p><PasswordLoginForm error={error} onLogin={() => setError("Exempel på ett inloggningsfel. Försök igen.")} onPasskey={() => setError("Exempel på avbruten passkey-inloggning. Försök igen.")} /></section>
    <section><h2>Inloggning pågår</h2><PasswordLoginForm pending onLogin={() => {}} onPasskey={() => {}} /></section>
    <section><h2>Kallelsesvar</h2><ActivityInvitationResponse activityId="33333333-3333-4333-8333-333333333333" cancelled={false} request={request} /></section>
    <section><h2>Inställd aktivitet</h2><ActivityInvitationResponse activityId="33333333-3333-4333-8333-333333333333" cancelled request={request} /></section>
    <section><h2>Kontomeny</h2><SessionMenu linkComponent={linkComponent} accountEmail="familj@example.invalid" logout={<button type="button" disabled>Logga ut</button>} /></section>
  </>;
}


/** Same renderer and write path, isolated fixtures only. */
function PersonalHomeExample({linkComponent}:{linkComponent?:NavigationLink}) {
  const first:Activity={id:"a1",organizationId:"o1",teamId:"t1",title:"Träning F2016",startsAt:"2030-10-26T15:45:00Z",endsAt:"2030-10-26T17:00:00Z",location:"Örvallen"};
  const second:Activity={...first,id:"a2",title:"Spela mera",startsAt:"2030-10-23T14:00:00Z",endsAt:"2030-10-23T15:00:00Z",location:"Uip"};
  const [items,setItems]=useState<OverviewItem[]>(()=>[second,first].flatMap(activity=>["Johan Exempel","Johan Andersson","Tilda Exempel","Alex Exempel","Alex Ekblad"].map((name,index)=>({activity,organization:{name:"Exempelföreningen",timeZone:"Europe/Stockholm"},team:{name:"F2016"},member:{id:`p${index}`,displayName:name},invitation:activity.id==="a1"?{id:`i${index}`,response:"pending" as const}:undefined}))));
  const [selected,setSelected]=useState<string>();
  const request:ParticipationFetch=async()=>Response.json({ok:true});
  return <section className="personal-dashboard" aria-label="Min översikt – interaktivt exempel">
    <p>Komprimerade kallelserader: unika förnamn, efternamnsinitialer och hela namn vid namnkrock. Svarsknapparna behåller minst 44 px tryckyta.</p>
    <PersonalHome items={items} activities={[second,first]} organizations={[{id:"o1",name:"Exempelföreningen",role:"owner",href:"/organizations/11111111-1111-4111-8111-111111111111"}]} teams={[{id:"t1",organizationId:"o1",name:"F2016",roles:["Målsman","Ledare","Lagåtkomst"],href:"/teams/22222222-2222-4222-8222-222222222222"}]} referenceTime="2030-10-20T00:00:00Z" request={request} linkComponent={linkComponent}
      onOpenActivity={item=>setSelected(item.activity.title)} onAnswered={(id,response)=>setItems(previous=>previous.map(item=>item.invitation?.id===id?{...item,invitation:{...item.invitation,response}}:item))} />
    {selected ? <p role="status">Öppnad exempelaktivitet: {selected}</p> : null}
  </section>;
}
