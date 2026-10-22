"use client";

import { useRef, useState } from "react";
import type { InvitationResponse } from "@/domain/club";
import type { OverviewPersonItem, OverviewAnswered, OverviewRespond } from "./personal-overview-types";

import type { components } from "../../backend/contract/generated";
import type { ParticipationFetch } from "./activity-invitation-response";

type AccessibleInvitation = components["schemas"]["AccessibleInvitation"];
type Props = { readOnly:boolean; demo?:boolean; onAnswered?:OverviewAnswered; request?:ParticipationFetch; onRespond?:OverviewRespond; busy?:boolean } &
  ({ item:OverviewPersonItem; invitation?:never } | { item?:never; invitation:AccessibleInvitation });
const labels = { pending:"Ej svarat", accepted:"Kommer", declined:"Kan ej" } as const;

/** One person's answer, independent of other people and the activity-details trigger. */
export function OverviewInvitationResponse({ item, invitation:directInvitation, readOnly, demo = false, onAnswered, request = fetch, onRespond, busy=false }:Props) {
  const invitation=directInvitation ?? item?.invitation;
  const name=directInvitation?.name ?? item!.member.displayName;
  const [saved, setSaved]=useState<{base:NonNullable<OverviewPersonItem["invitation"]> | AccessibleInvitation; response:InvitationResponse}>();
  const [pending, setPending]=useState(false);
  const [error, setError]=useState<NonNullable<OverviewPersonItem["invitation"]> | AccessibleInvitation>();
  const writing=useRef(false);
  // A fresh server snapshot supersedes a locally confirmed answer after refresh/push.
  const response=saved && saved.base===invitation ? saved.response : invitation?.response;
  async function answer(next:"accepted"|"declined") {
    if(!invitation || readOnly || demo || busy || writing.current || response===next)return;
    writing.current=true;setPending(true);setError(undefined);
    try {
      if(onRespond) {
        if(!await onRespond(invitation.id,next)) return;
      } else {
        const result=await request(`/api/invitations/${encodeURIComponent(invitation.id)}/respond`,{
          method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({response:next}),
        });
        if(!result.ok)throw new Error("Svaret kunde inte sparas. Försök igen.");
      }
      setSaved({base:invitation,response:next});
      onAnswered?.(invitation.id, next);
    } catch {setError(invitation);}
    finally {writing.current=false;setPending(false);}
  }
  return <div className="personal-activity-person" data-invitation-id={invitation?.id}>
    <span className="overview-person-avatar" aria-hidden="true">{name.slice(0,1)}</span>
    <div className="overview-person-copy"><strong>{name}</strong><span>{[item?.hasDutyAssignment ? "Bokad arbetsuppgift" : undefined,response ? labels[response] : undefined].filter(Boolean).join(" · ") || "Ingen kallelse ännu"}</span></div>
    {invitation ? <div className="overview-response-actions" role="group" aria-label={`Kallelsesvar för ${name}`}>
      {(["accepted","declined"] as const).map(value=><button key={value} type="button" data-response={value} aria-label={`${labels[value]}: ${name}`} aria-pressed={response===value} disabled={readOnly || demo || pending || busy} onClick={()=>void answer(value)}><span aria-hidden="true">{value==="accepted" ? "✓" : "×"}</span> {labels[value]}</button>)}
    </div> : null}
    {pending ? <small className="overview-response-feedback" role="status">Sparar svaret för {name}…</small> : saved && saved.base===invitation ? <small className="sr-only" role="status">Svaret för {name} har sparats.</small> : null}
    {error && error===invitation ? <small className="overview-response-feedback" role="alert">Svaret kunde inte sparas. Försök igen.</small> : null}
  </div>;
}
