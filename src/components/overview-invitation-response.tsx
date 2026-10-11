"use client";

import { useRef, useState } from "react";
import type { FamilyActivity, Invitation, InvitationResponse } from "@/domain/club";

type Props = { item:FamilyActivity; readOnly:boolean; demo?:boolean; onAnswered?:()=>void };
const labels = { pending:"Ej svarat", accepted:"Kommer", declined:"Kan ej" } as const;

/** One person's answer, independent of other people and the activity-details trigger. */
export function OverviewInvitationResponse({ item, readOnly, demo = false, onAnswered }:Props) {
  const invitation=item.invitation;
  const [saved, setSaved]=useState<{base:Invitation; response:InvitationResponse}>();
  const [pending, setPending]=useState(false);
  const [error, setError]=useState<string>();
  const writing=useRef(false);
  // A fresh server snapshot supersedes a locally confirmed answer after refresh/push.
  const response=saved && saved.base===invitation ? saved.response : invitation?.response;
  async function answer(next:"accepted"|"declined") {
    if(!invitation || readOnly || demo || writing.current || response===next)return;
    writing.current=true;setPending(true);setError(undefined);
    try {
      const result=await fetch(`/api/invitations/${encodeURIComponent(invitation.id)}/respond`,{
        method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({response:next}),
      });
      if(!result.ok)throw new Error("Svaret kunde inte sparas. Försök igen.");
      setSaved({base:invitation,response:next});
      onAnswered?.();
    } catch {setError("Svaret kunde inte sparas. Försök igen.");}
    finally {writing.current=false;setPending(false);}
  }
  return <div className="personal-activity-person">
    <span className="overview-person-avatar" aria-hidden="true">{item.member.displayName.slice(0,1)}</span>
    <div className="overview-person-copy"><strong>{item.member.displayName}</strong><span>{[item.hasDutyAssignment ? "Bokad arbetsuppgift" : undefined,response ? labels[response] : undefined].filter(Boolean).join(" · ") || "Ingen kallelse ännu"}</span></div>
    {invitation ? <div className="overview-response-actions" role="group" aria-label={`Kallelsesvar för ${item.member.displayName}`}>
      {(["accepted","declined"] as const).map(value=><button key={value} type="button" data-response={value} aria-label={`${labels[value]}: ${item.member.displayName}`} aria-pressed={response===value} disabled={readOnly || demo || pending} onClick={()=>void answer(value)}><span aria-hidden="true">{value==="accepted" ? "✓" : "×"}</span> {labels[value]}</button>)}
    </div> : null}
    {pending ? <small className="overview-response-feedback" role="status">Sparar svaret för {item.member.displayName}…</small> : saved && saved.base===invitation ? <small className="sr-only" role="status">Svaret för {item.member.displayName} har sparats.</small> : null}
    {error ? <small className="overview-response-feedback" role="alert">{error}</small> : null}
  </div>;
}
