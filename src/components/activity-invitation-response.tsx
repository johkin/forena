"use client";
import { useEffect, useState } from "react";
import type { components } from "../../backend/contract/generated";
type Invitation = components["schemas"]["MyInvitations"]["invitations"][number];
export type ParticipationFetch = (path: string, init?: RequestInit) => Promise<Response>;
export function ActivityInvitationResponse({ activityId, cancelled, readOnly = false, responseClosed = false, request = fetch }: { activityId:string; cancelled:boolean; readOnly?:boolean; responseClosed?:boolean; request?: ParticipationFetch }) {
  const [items,setItems] = useState<Invitation[]>([]);
  // Keep unsaved text separate from server state so a push cannot erase edits.
  const [drafts,setDrafts] = useState<Record<string,string>>({});
  const [refreshVersion,setRefreshVersion] = useState(0);
  const [error,setError] = useState<string>();
  const [saved,setSaved] = useState<string>();
  const [pending,setPending] = useState(false);
  const [loading,setLoading] = useState(true);
  useEffect(()=>{
    if (!("serviceWorker" in navigator)) return;
    const refresh = (event:MessageEvent) => {
      if(event.data?.type === "activity-notification") setRefreshVersion(version=>version+1);
    };
    navigator.serviceWorker.addEventListener("message",refresh);
    return ()=>navigator.serviceWorker.removeEventListener("message",refresh);
  },[]);
  useEffect(()=>{
    // Refetch after an in-flight write; do not let an older read win the race.
    if(pending) return;
    const controller=new AbortController();
    request(`/api/activities/${activityId}/my-invitations`,{signal:controller.signal})
      .then(async r=>{if(!r.ok)throw new Error();return r.json();})
      .then(data=>{if(!controller.signal.aborted){setItems(data.invitations);setError(undefined);}})
      .catch(()=>{if(!controller.signal.aborted)setError("Kallelserna kunde inte hämtas. Försök öppna aktiviteten igen.");})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[activityId,refreshVersion,pending,request]);
  async function answer(item:Invitation,response:Invitation["response"]) {
    if (readOnly || cancelled || responseClosed) return;
    setPending(true);setError(undefined);setSaved(undefined);
    const comment=response==="pending"?"":drafts[item.id] ?? item.response_comment ?? "";
    try {
      const r=await request(`/api/invitations/${item.id}/respond`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({response,comment})});
      if(!r.ok)throw new Error();
      setItems(current=>current.map(i=>i.id===item.id?{...i,response,response_comment:comment}:i));
      setDrafts(current=>{const next={...current};delete next[item.id];return next;});
      setSaved(`Svaret för ${item.name} har sparats.`);
    } catch {setError("Svaret kunde inte sparas. Försök igen.");} finally {setPending(false);}
  }
  return <section aria-label="Dina kallelser" data-response-closed={responseClosed || undefined}>
    {responseClosed && !readOnly && !cancelled ? <p>Svarstiden har gått ut.</p> : null}
    {!cancelled && loading ? <p role="status">Laddar kallelser…</p> : null}
    {!cancelled && !loading && !error && items.length === 0 ? <p>Inga kallelser att visa för den här aktiviteten.</p> : null}
    {cancelled?<p role="status">Aktiviteten är inställd.</p>:items.map(item=>{
      if (readOnly) return <div key={item.id} className="personal-invitation-response"><strong>{item.name}</strong><p>Kallelsesvar: {{ accepted: "Kommer", declined: "Kan inte", pending: "Ej svarat" }[item.response]}</p>{item.response_comment ? <p>Kommentar: {item.response_comment}</p> : null}</div>;
      const comment=drafts[item.id] ?? item.response_comment ?? "";
      const changed=comment !== (item.response_comment ?? "");
      return <div key={item.id} className="personal-invitation-response">
        <strong>{item.name}</strong>
        <label>Kommentar<input disabled={pending || responseClosed} maxLength={500} value={comment}
          onChange={e=>{setSaved(undefined);setDrafts(current=>({...current,[item.id]:e.target.value}));}}/></label>
        <div className="personal-response">
          <button type="button" className={item.response==="accepted"?"selected":""} disabled={pending || responseClosed} onClick={()=>void answer(item,"accepted")}>Kommer</button>
          <button type="button" className={item.response==="declined"?"selected":""} disabled={pending || responseClosed} onClick={()=>void answer(item,"declined")}>Kan inte</button>
          {changed && item.response!=="pending"?<button type="button" disabled={pending || responseClosed} onClick={()=>void answer(item,item.response)}>Spara kommentar</button>:null}
          {item.response!=="pending"?<button type="button" disabled={pending || responseClosed} onClick={()=>void answer(item,"pending")}>Ta bort svar</button>:null}
        </div>
      </div>;
    })}
    {saved?<p role="status">{saved}</p>:null}{error?<p role="alert">{error}</p>:null}
  </section>;
}
