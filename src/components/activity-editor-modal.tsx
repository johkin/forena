"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Activity, Member, Organization, Team } from "@/domain/club";
import { invitationScheduleForOccurrence, previewSingleActivity, previewWeeklySeries, type ActivityOccurrence, type ResponseDueRule } from "@/lib/activity-series";
import type { ActivityDraft } from "@/lib/ai/activity-draft";
import { attendanceNames } from "@/lib/attendance-names";
import type { AudienceRole } from "@/lib/invitation-audience";
import { useModalScrollLock } from "@/lib/use-modal-scroll-lock";

type Props = { mode: "create" | "edit"; organization: Organization; team: Team; members: Member[]; activity?: Activity; draft?: ActivityDraft; source: "database" | "demo"; onClose: () => void; onNotice: (notice: string) => void; };
const weekdayOptions = [[1,"Mån"],[2,"Tis"],[3,"Ons"],[4,"Tor"],[5,"Fre"],[6,"Lör"],[7,"Sön"]] as const;
const roleLabels: Record<AudienceRole,string> = { participant:"Spelare",leader:"Ledare" };
const directRoles: AudienceRole[] = ["participant","leader"];
const scheduledRoles: AudienceRole[] = ["participant","leader"];

function Help({children,label}:{children:React.ReactNode;label:string}) {
  return <details className="editor-help"><summary aria-label={`Hjälp: ${label}`} title={`Hjälp: ${label}`}>?</summary><p>{children}</p></details>;
}

function localParts(value:string|undefined,timeZone:string) {
  const date=value?new Date(value):new Date();
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date).map(part=>[part.type,part.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
}

export function ActivityEditorModal({mode,organization,team,members,activity,draft,source,onClose,onNotice}:Props) {
  useModalScrollLock();
  const timeZone=organization.timeZone??"Europe/Stockholm";
  const initial=draft?{date:draft.startsOn,time:draft.startTime}:localParts(activity?.startsAt,timeZone);
  const initialDuration=draft?.durationMinutes??(activity?Math.round((new Date(activity.endsAt).getTime()-new Date(activity.startsAt).getTime())/60000):90);
  const initialGathering=draft?.gatheringMinutesBefore??(activity?.gatheringAt?Math.max(0,Math.round((new Date(activity.startsAt).getTime()-new Date(activity.gatheringAt).getTime())/60000)):0);
  const [kind,setKind]=useState<"single"|"series">("single");
  const [preview,setPreview]=useState<ActivityOccurrence[]>();
  const [payload,setPayload]=useState<Record<string,unknown>>();
  const [pending,setPending]=useState(false);
  const [error,setError]=useState<string>();
  const [groups,setGroups]=useState<{id:string;name:string}[]>([]);
  const [responsibilities,setResponsibilities]=useState<{id:string;name:string}[]>([]);
  const [selectedRoles,setSelectedRoles]=useState<Set<AudienceRole>>(new Set(["participant","leader"]));
  const [selectedGroups,setSelectedGroups]=useState<Set<string>>(new Set());
  const [selectedResponsibilities,setSelectedResponsibilities]=useState<Set<string>>(new Set());
  const [invitationMode,setInvitationMode]=useState<"none"|"now"|"schedule">(draft?"now":mode==="create"?"schedule":"none");
  const [selectedPeople,setSelectedPeople]=useState<Set<string>>(new Set(draft?members.filter(member=>member.teamRelation==="player").map(member=>member.id):[]));
  const [descriptionOpen,setDescriptionOpen]=useState(Boolean(draft?.description||activity?.description));
  const [invitationOpen,setInvitationOpen]=useState(mode==="create");
  const [reminderOffsets,setReminderOffsets]=useState<number[]>([1440]);
  const formatter=useMemo(()=>new Intl.DateTimeFormat("sv-SE",{timeZone,weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}),[timeZone]);
  const names=useMemo(()=>attendanceNames(members.map(member=>({personId:member.id,displayName:member.displayName}))),[members]);
  const invited=members.filter(member=>selectedPeople.has(member.id));
  const available=members.filter(member=>!selectedPeople.has(member.id));
  const recurring=mode==="create"&&kind==="series";
  useEffect(()=>{if(source!=="database")return;fetch(`/api/team-groups?teamId=${encodeURIComponent(team.id)}`).then(r=>r.ok?r.json():{groups:[],responsibilities:[]}).then(body=>{setGroups(body.groups??[]);setResponsibilities(body.responsibilities??[]);}).catch(()=>{setGroups([]);setResponsibilities([]);});},[mode,source,team.id]);

  function togglePerson(id:string) {
    setSelectedPeople(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});
  }

  function peopleColumn(people:Member[],selected:boolean) {
    return directRoles.map(role=>{
      const matching=people.filter(member=>member.teamRelation === (role === "participant" ? "player" : "leader"));
      return matching.length?<div className="person-picker-group" key={role}>
        <h4>{roleLabels[role]} ({matching.length})</h4>
        {matching.map(member=><button key={member.id} type="button" className="attendance-person" onClick={()=>togglePerson(member.id)}
          aria-label={`${selected?"Ta bort":"Lägg till"} ${member.displayName}, ${roleLabels[role].toLowerCase()}`} title={member.displayName}>
          <strong>{names.get(member.id)}</strong>
        </button>)}
      </div>:null;
    });
  }


  function prepare(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data=new FormData(event.currentTarget);
    const startsOn=String(data.get("startsOn")), startTime=String(data.get("startTime"));
    const durationMinutes=Number(data.get("durationMinutes")), gatheringMinutesBefore=Number(data.get("gatheringMinutesBefore"));
    const base={startsOn,startTime,durationMinutes,gatheringMinutesBefore,timeZone};
    try {
      const occurrences=recurring?previewWeeklySeries({...base,endsOn:String(data.get("endsOn")),weekdays:data.getAll("weekdays").map(Number)}):[previewSingleActivity(base)];
      const invitationSendMinutesBefore=Number(data.get("invitationSendMinutesBefore")||10080);
      const responseDueRule=String(data.get("responseDueRule")||"6h") as ResponseDueRule;
      const reminderMinutesBeforeDue=reminderOffsets[0]??0;
      const invitationAudience=invitationMode==="schedule"?"selection":undefined;
      const invitationSelection={roles:[...selectedRoles],groupIds:[...selectedGroups],responsibilityTypeIds:[...selectedResponsibilities]};
      if(invitationMode==="schedule"&&!invitationSelection.roles.length&&!invitationSelection.groupIds.length&&!invitationSelection.responsibilityTypeIds.length) throw new Error("Välj minst en målgrupp.");
      if(invitationMode==="now"&&!selectedPeople.size) throw new Error("Välj minst en person att kalla.");
      if(invitationMode==="schedule") occurrences.forEach(item=>invitationScheduleForOccurrence(item.startsAt,timeZone,{invitationSendMinutesBefore,responseDueRule,reminderMinutesBeforeDue}));
      setPreview(occurrences);
      setPayload({teamId:team.id,title:String(data.get("title")),description:String(data.get("description")),location:String(data.get("location")),invitationMode,invitationAudience,invitationSelection:invitationMode==="schedule"?invitationSelection:undefined,personIds:invitationMode==="now"?[...selectedPeople]:undefined,invitationSendMinutesBefore,responseDueRule,reminderMinutesBeforeDue,reminderMinutesBeforeDueList:reminderOffsets,...base,endsOn:recurring?String(data.get("endsOn")):startsOn,weekdays:recurring?data.getAll("weekdays").map(Number):[new Date(`${startsOn}T00:00:00Z`).getUTCDay()||7]});
      setError(undefined);
    } catch(caught) { setError(caught instanceof Error?caught.message:"Förhandsgranskningen kunde inte skapas"); }
  }

  async function save() {
    if(!preview?.length||!payload)return;
    setPending(true); setError(undefined);
    if(source==="demo"){onNotice(`${String(payload.title)} förhandsgranskades i demoläge.`);onClose();return;}
    const occurrence=preview[0], endpoint=mode==="edit"?`/api/activities/${activity?.id}`:recurring?"/api/activity-series":"/api/activities";
    const body=mode==="edit"||!recurring?{...payload,gatheringAt:occurrence.gatheringAt,startsAt:occurrence.startsAt,endsAt:occurrence.endsAt}:payload;
    const response=await fetch(endpoint,{method:mode==="edit"?"PUT":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const result=await response.json(); setPending(false);
    if(!response.ok){setError(result.error??"Aktiviteten kunde inte sparas");return;}
    const savedActivityId=activity?.id??result.activity?.id;
    if(savedActivityId&&invitationMode!=="none"&&mode==="edit"){
      const invitationResponse=await fetch(`/api/activities/${savedActivityId}/invitations`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(invitationMode==="now"?{mode:"now",personIds:[...selectedPeople]}:{mode:"schedule",audience:"selection",selection:payload.invitationSelection,invitationSendMinutesBefore:payload.invitationSendMinutesBefore,responseDueRule:payload.responseDueRule,reminderMinutesBeforeDue:payload.reminderMinutesBeforeDue,reminderMinutesBeforeDueList:payload.reminderMinutesBeforeDueList})});
      const invitationResult=await invitationResponse.json();
      if(!invitationResponse.ok){setError(invitationResult.error??"Aktiviteten sparades, men kallelsen kunde inte läggas till");return;}
    }
    onNotice(recurring?`${preview.length} aktiviteter skapades.`:mode==="edit"?"Aktiviteten uppdaterades.":"Aktiviteten skapades.");onClose();window.location.reload();
  }

  async function remove() {
    if(!activity||source==="demo"||!window.confirm("Ta bort aktiviteten? Om någon redan har svarat blir den i stället markerad som inställd."))return;
    setPending(true);
    const response=await fetch(`/api/activities/${activity.id}`,{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({reason:"Inställd av ledare"})});
    const result=await response.json();
    if(!response.ok){setError(result.error??"Aktiviteten kunde inte tas bort");setPending(false);return;}
    onNotice(result.disposition==="cancelled"?"Aktiviteten ställdes in eftersom svar redan fanns.":"Aktiviteten togs bort.");onClose();window.location.reload();
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="modal activity-editor-modal" role="dialog" aria-modal="true" aria-labelledby="activity-editor-title">
      <div className="card-heading"><div><p className="eyebrow">{team.name}</p><h2 id="activity-editor-title">{mode==="edit"?"Redigera aktivitet":"Ny aktivitet"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Stäng" type="button">✕</button></div>
      {draft?<div className="ai-draft-notice"><strong>AI-utkast för granskning</strong><span>Kontrollera särskilt datum, plats och text innan aktiviteten skapas.</span>{draft.sources.length?<div>{draft.sources.map(source=><a href={source.url} key={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div>:<small>Inga webbkällor följde med utkastet.</small>}</div>:null}
      <form onSubmit={prepare} onChange={()=>{setPreview(undefined);setPayload(undefined);}}>
        {mode==="create"?<div className="activity-kind-switch" role="group" aria-label="Typ av aktivitet"><button className={kind==="single"?"selected":""} onClick={()=>setKind("single")} type="button">En aktivitet</button><button className={kind==="series"?"selected":""} onClick={()=>setKind("series")} type="button">Aktivitetsserie</button></div>:null}
        <section className="editor-section" aria-labelledby="editor-basics-title">
          <h3 id="editor-basics-title">Aktivitet</h3>
          <div className="editor-fields">
            <label>Titel<input name="title" required defaultValue={draft?.title??activity?.title??""} placeholder="Träning eller match"/></label>
            <label>Plats<input name="location" required defaultValue={draft?.location??activity?.location??""} placeholder="Plan eller hall"/></label>
          </div>
          <details className="editor-optional" open={descriptionOpen} onToggle={event=>setDescriptionOpen(event.currentTarget.open)}><summary>Beskrivning (valfritt)</summary><label className="sr-only" htmlFor="editor-description">Beskrivning</label><textarea id="editor-description" name="description" rows={3} defaultValue={draft?.description??activity?.description??""} placeholder="Praktisk information till deltagarna"/></details>
        </section>
        <section className="editor-section" aria-labelledby="editor-time-title">
          <h3 id="editor-time-title">När och varaktighet</h3>
          {recurring?<><fieldset><legend>Veckodagar</legend><div className="weekday-options">{weekdayOptions.map(([value,label])=><label key={value}><input type="checkbox" name="weekdays" value={value} defaultChecked={value===(new Date(`${initial.date}T00:00:00Z`).getUTCDay()||7)}/>{label}</label>)}</div></fieldset><div className="form-row"><label>Startdatum<input name="startsOn" type="date" required defaultValue={initial.date}/></label><label>Slutdatum<input name="endsOn" type="date" required defaultValue={initial.date}/></label></div><label>Tid<input name="startTime" type="time" step={300} required defaultValue={initial.time}/></label></>:<div className="form-row"><label>Datum<input name="startsOn" type="date" required defaultValue={initial.date}/></label><label>Tid<input name="startTime" type="time" step={300} required defaultValue={initial.time}/></label></div>}
          <div className="form-row"><label>Längd<select name="durationMinutes" defaultValue={String(initialDuration)}><option value="30">30 minuter</option><option value="45">45 minuter</option><option value="60">1 timme</option><option value="75">1 tim 15 min</option><option value="90">1,5 timmar</option><option value="120">2 timmar</option><option value="180">3 timmar</option><option value="480">Heldag (8 timmar)</option></select></label><label>Samling före start<select name="gatheringMinutesBefore" defaultValue={String(initialGathering)}><option value="0">Ingen särskild samling</option><option value="15">15 minuter</option><option value="30">30 minuter</option><option value="45">45 minuter</option><option value="60">60 minuter</option></select></label></div>
        </section>
        <details className="editor-section editor-invitation" open={invitationOpen} onToggle={event=>setInvitationOpen(event.currentTarget.open)}>
          <summary>Kallelse <span>{invitationMode==="none"?"Ingen":invitationMode==="now"?"Skicka nu":"Schemalägg"}</span></summary>
          <div className="activity-kind-switch invitation-mode-switch" role="group" aria-label="Kallelse"><button className={invitationMode==="none"?"selected":""} onClick={()=>setInvitationMode("none")} type="button">Ingen</button><button className={invitationMode==="now"?"selected":""} onClick={()=>setInvitationMode("now")} type="button">Skicka nu</button><button className={invitationMode==="schedule"?"selected":""} onClick={()=>setInvitationMode("schedule")} type="button">Schemalägg</button></div>
          {invitationMode==="now"?<div className="editor-invitation-body">
            <div className="editor-inline-heading"><strong>Välj personer</strong><Help label="Skicka nu">Tryck på ett namn för att flytta det till listan över mottagare. Du kan välja spelare, ledare och andra roller tillsammans.</Help></div>
            <div className="attendance-columns person-picker-columns">
              <section className="attendance-column" aria-label={`Ej valda, ${available.length} personer`}><h3 className="attendance-absent-heading">Ej valda ({available.length})</h3><div className="attendance-roster">{peopleColumn(available,false)}</div></section>
              <section className="attendance-column" aria-label={`Valda, ${invited.length} personer`}><h3 className="attendance-present-heading">Valda ({invited.length})</h3><div className="attendance-roster">{peopleColumn(invited,true)}</div></section>
            </div>
          </div>:null}
          {invitationMode==="schedule"?<div className="editor-invitation-body">
            <div className="editor-inline-heading"><strong>Målgrupper</strong><Help label="Målgrupper">Valda roller och undergrupper kombineras utan dubletter. Personerna bestäms när kallelsen skickas, så ändringar i laget följer med.</Help></div>
            <div className="audience-options">
              {scheduledRoles.map(role=><label key={role}><input type="checkbox" checked={selectedRoles.has(role)} onChange={()=>setSelectedRoles(current=>{const next=new Set(current);if(next.has(role))next.delete(role);else next.add(role);return next;})}/>{roleLabels[role]}</label>)}
              {responsibilities.map(role=><label key={role.id}><input type="checkbox" checked={selectedResponsibilities.has(role.id)} onChange={()=>setSelectedResponsibilities(current=>{const next=new Set(current);if(next.has(role.id))next.delete(role.id);else next.add(role.id);return next;})}/>{role.name}</label>)}
              {groups.map(group=><label key={group.id}><input type="checkbox" checked={selectedGroups.has(group.id)} onChange={()=>setSelectedGroups(current=>{const next=new Set(current);if(next.has(group.id))next.delete(group.id);else next.add(group.id);return next;})}/>{group.name}</label>)}
            </div>
            <div className="form-row"><label>Skicka kallelsen<select name="invitationSendMinutesBefore" defaultValue="10080"><option value="20160">14 dagar före</option><option value="10080">7 dagar före</option><option value="4320">3 dagar före</option><option value="2880">2 dagar före</option><option value="1440">1 dag före</option><option value="720">12 timmar före</option><option value="360">6 timmar före</option><option value="60">1 timme före</option></select></label><label>Svara senast<select name="responseDueRule" defaultValue="6h"><option value="0h">Vid aktivitetsstart</option><option value="1h">1 timme före</option><option value="2h">2 timmar före</option><option value="6h">6 timmar före</option><option value="previous-midnight">Dagen innan kl 00:00</option><option value="1d">1 dag före</option><option value="2d">2 dagar före</option><option value="3d">3 dagar före</option></select></label></div>
            <div className="editor-inline-heading"><strong>Påminnelser till obesvarade</strong><Help label="Påminnelser">Du kan lägga till flera påminnelser. Bara personer som fortfarande inte har svarat får respektive utskick.</Help></div>
            {reminderOffsets.map((offset,index)=><div className="reminder-row" key={index}><label>Påminn före svarstiden<select value={String(offset)} onChange={event=>setReminderOffsets(current=>current.map((value,i)=>i===index?Number(event.target.value):value))}><option value="60">1 timme</option><option value="360">6 timmar</option><option value="720">12 timmar</option><option value="1440">1 dag</option><option value="2880">2 dagar</option></select></label><button className="secondary" type="button" onClick={()=>setReminderOffsets(current=>current.filter((_,i)=>i!==index))}>Ta bort</button></div>)}
            <button className="secondary" type="button" onClick={()=>setReminderOffsets(current=>[...current,1440])}>+ Lägg till påminnelse</button>
          </div>:null}
        </details>
        {error?<p className="auth-error" role="alert">{error}</p>:null}
        {preview?<div className="activity-preview"><p className="eyebrow">Förhandsgranskning · {preview.length} {preview.length===1?"tillfälle":"tillfällen"}</p><ol>{preview.slice(0,12).map(item=><li key={item.startsAt}><strong>{formatter.format(new Date(item.startsAt))}</strong><span>{String(payload?.location)}</span></li>)}</ol></div>:null}
        <div className="modal-actions">{mode==="edit"?<button className="danger" disabled={pending} onClick={()=>void remove()} type="button">Ta bort</button>:null}<button className="secondary" onClick={onClose} type="button">Avbryt</button>{preview?<button className="primary" disabled={pending} onClick={()=>void save()} type="button">{pending?"Sparar…":mode==="edit"?"Spara ändring":recurring?`Skapa ${preview.length} aktiviteter`:"Skapa aktivitet"}</button>:<button className="primary" type="submit">Förhandsgranska</button>}</div>
      </form>
    </section>
  </div>;
}
