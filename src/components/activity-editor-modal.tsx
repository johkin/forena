"use client";

import { FormEvent, useEffect, useMemo, useState, useRef } from "react";
import type { Activity, Member, Organization, Team } from "@/domain/club";
import { previewWeeklySeries, previewRuleSingleActivity, previewRuleWeeklySeries, type ActivityOccurrence } from "@/lib/activity-series";
import type { ActivityDraft } from "@/lib/ai/activity-draft";
import { PersonSelectionList } from "./person-selection-list";
import type { AudienceRole } from "@/lib/invitation-audience";
import { DateTimeRangeFields } from "./date-time-range-fields";
import { ActivityDatePicker, shiftCalendarDate } from "./activity-date-picker";
import { ActivityTimeStepper } from "./activity-time-stepper";
import { FALLBACK_TIMING_OPTIONS, timingChoices } from "@/lib/activity-timing-options";
import { ActivityTimingFields } from "./activity-timing-fields";
import type { ActivityConfiguration } from "@/lib/activity-configuration";
import { BASE_DISCIPLINE_DEFAULTS } from "@/lib/discipline-defaults";
import { applyUntouchedDefaults } from "@/lib/activity-editor-defaults";
import { durationToMinutes, localActivityTime, normalizeActivityTimingRules, type ActivityTimingRules } from "@/lib/activity-time-rules";
import { prepareInvitationSchedule, requireFutureSchedule } from "@/lib/activity-schedule";
import { activityRangeDuration } from "@/lib/activity-range";
import { useModalScrollLock } from "@/lib/use-modal-scroll-lock";

export type ActivityEditorAdapter = {
  request: (path: string, init?: RequestInit) => Promise<Response>;
  onSaved: (activityId?: string) => void;
  revision?: number;
  singleOnly?: boolean;
};

type Props = { adapter?: ActivityEditorAdapter; mode: "create" | "edit"; organization: Organization; team: Team; members: Member[]; activity?: Activity; draft?: ActivityDraft; source: "database" | "demo"; canManageInvitations: boolean; onClose: () => void; onNotice: (notice: string) => void; };
const weekdayOptions = [[1,"Mån"],[2,"Tis"],[3,"Ons"],[4,"Tor"],[5,"Fre"],[6,"Lör"],[7,"Sön"]] as const;
const roleLabels: Record<AudienceRole,string> = { participant:"Spelare",leader:"Ledare" };
const recipientGroups = [{role:"participant",label:"Spelare"},{role:"leader",label:"Ledare"}];
const scheduledRoles: AudienceRole[] = ["participant","leader"];

function ActivityTypeIcon({category}:{category:string}) {
  const paths:Record<string,string>={
    session:"M4 11h16M6 8v6M3 9v4M18 8v6M21 9v4",
    competition:"M8 3h8v6a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 13v6m-4 2h8",
    meeting:"M9 8a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM6 20v-2a6 6 0 0 1 12 0v2M3 8h2m14 0h2M2 18v-2m20 2v-2",
    work:"M8 6V3h8v3M3 6h18v14H3V6Zm0 6h18M10 10h4v4h-4v-4",
  };
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[category] ?? "M4 5h16v16H4V5ZM8 3v4m8-4v4M4 10h16"}/></svg>;
}

function Help({children,label}:{children:React.ReactNode;label:string}) {
  return <details className="editor-help"><summary aria-label={`Hjälp: ${label}`} title={`Hjälp: ${label}`}>?</summary><p>{children}</p></details>;
}

function localParts(value:string|undefined,timeZone:string) {
  const date=value?new Date(value):new Date();
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date).map(part=>[part.type,part.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${value ? parts.minute : String(Math.floor(Number(parts.minute)/5)*5).padStart(2,"0")}`};
}

/** Edit activities and recipient selections, then preview before persisting changes. */
export function ActivityEditorModal({mode,organization,team,members,activity,draft,source,canManageInvitations,onClose,onNotice,adapter}:Props) {
  useModalScrollLock();
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  const request = adapter?.request ?? fetch;
  const timeZone=organization.timeZone??"Europe/Stockholm";
  const initial=draft?{date:draft.startsOn,time:draft.startTime}:localParts(activity?.startsAt,timeZone);
  const initialDuration=draft?.durationMinutes??(activity?Math.round((new Date(activity.endsAt).getTime()-new Date(activity.startsAt).getTime())/60000):90);
  const initialGathering=draft?.gatheringMinutesBefore??(activity?.gatheringAt?Math.max(0,Math.round((new Date(activity.startsAt).getTime()-new Date(activity.gatheringAt).getTime())/60000)):0);
  const [scheduleDates, setScheduleDates] = useState({ startsOn:initial.date, endsOn:draft?.recurrence ? draft.recurrence.endsOn ?? "" : initial.date, startTime:initial.time,
    weekdays:draft?.recurrence?.weekdays ?? [new Date(`${initial.date}T00:00:00Z`).getUTCDay() || 7] });
  const [editScope,setEditScope]=useState<"single"|"following"|null>(activity?.seriesId ? null : "single");
  const [seriesPreview,setSeriesPreview]=useState<{token:string;count:number;skipped:number;activities:{id:string;startsAt:string;endsAt:string}[]}>();
  const [deletePreview,setDeletePreview]=useState<{token:string;count:number;skipped:number;activities:{id:string;startsAt:string;endsAt:string}[]}>();
  const [seriesChanges,setSeriesChanges]=useState<Record<string,unknown>>();
  const [kind,setKind]=useState<"single"|"series">(draft?.recurrence?"series":"single");
  const [preview,setPreview]=useState<(ActivityOccurrence & { invitationSendAt:string;responseDueAt:string;reminderSendAts:string[];sendImmediately?:boolean })[]>();
  const [payload,setPayload]=useState<Record<string,unknown>>();
  const [pending,setPending]=useState(false);
  const [error,setError]=useState<string>();
  const [groups,setGroups]=useState<{id:string;name:string;personIds?:string[]}[]>([]);
  const [responsibilities,setResponsibilities]=useState<{id:string;name:string}[]>([]);
  const [selectedRoles,setSelectedRoles]=useState<Set<AudienceRole>>(new Set());
  const [selectedGroups,setSelectedGroups]=useState<Set<string>>(new Set());
  const [selectedResponsibilities,setSelectedResponsibilities]=useState<Set<string>>(new Set());
  const [invitationMode,setInvitationMode]=useState<"none"|"now"|"schedule">("none");
  const [selectedPeople,setSelectedPeople]=useState<Set<string>>(new Set());
  const [descriptionOpen,setDescriptionOpen]=useState(Boolean(draft?.description||activity?.description));
  const [invitationOpen,setInvitationOpen]=useState(canManageInvitations);
  const [configuration,setConfiguration] = useState<ActivityConfiguration>();
  const [configurationError,setConfigurationError] = useState<string>();
  const [activityTypeId,setActivityTypeId] = useState(activity?.activityTypeId ?? draft?.activityTypeId ?? "");
  const touched = useRef(new Set<keyof ActivityTimingRules>(mode === "edit" || draft ? ["duration","gatheringRule"] : []));
  const [touchedKeys,setTouchedKeys] = useState(new Set<keyof ActivityTimingRules>(mode === "edit" || draft ? ["duration","gatheringRule"] : []));
  const [rules,setRules] = useState<ActivityTimingRules>({ ...BASE_DISCIPLINE_DEFAULTS, duration:`PT${initialDuration}M`,gatheringRule:initialGathering ? `start-${initialGathering}m` : "start",reminderRules:[...BASE_DISCIPLINE_DEFAULTS.reminderRules] });
  const [explicitEnd, setExplicitEnd] = useState<{ date: string; time: string } | null>(activity ? localParts(activity.endsAt, timeZone) : null);
  const end = explicitEnd ?? (() => {
    try { return localParts(new Date(localActivityTime(scheduleDates.startsOn, scheduleDates.startTime, timeZone).getTime() + durationToMinutes(rules.duration) * 60000).toISOString(), timeZone); }
    catch { return { date: scheduleDates.startsOn, time: scheduleDates.startTime }; }
  })();
  const typeDefaults = configuration?.types.find(type=>type.id===activityTypeId)?.defaults;
  const timeOptions=typeDefaults?.options ?? FALLBACK_TIMING_OPTIONS;
  const durationChoices=timingChoices("duration",timeOptions.duration,kind==="series"?[rules.duration]:[]).filter((choice,index,choices)=>(kind==="series" || [60,90,120].includes(durationToMinutes(choice.value))) && choices.findIndex(item=>durationToMinutes(item.value)===durationToMinutes(choice.value))===index);
  const gatheringChoices=timingChoices("gatheringRule",timeOptions.gatheringRule,[rules.gatheringRule]).filter(choice=>["start","start-15m","start-30m","start-45m","start-60m"].includes(choice.value) || choice.value===rules.gatheringRule);
  let currentDuration=0;
  try {currentDuration=durationToMinutes(activityRangeDuration(scheduleDates.startsOn,scheduleDates.startTime,end.date,end.time,timeZone));} catch {}
  let rangeSummary:ActivityOccurrence|undefined;
  try {rangeSummary=previewRuleSingleActivity({startsOn:scheduleDates.startsOn,startTime:scheduleDates.startTime,timeZone,rules:{...rules,duration:kind==="series" ? rules.duration : activityRangeDuration(scheduleDates.startsOn,scheduleDates.startTime,end.date,end.time,timeZone)}});} catch {}
  const clockFormatter=new Intl.DateTimeFormat("sv-SE",{timeZone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
  useEffect(()=>{
    if (source !== "database") return;
    const controller = new AbortController();
    request(`/api/activity-configuration?teamId=${encodeURIComponent(team.id)}`,{signal:controller.signal})
      .then(async response=> { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result as ActivityConfiguration; })
      .then(config=> { setConfiguration(config); const requestedTypeId = activity?.activityTypeId ?? draft?.activityTypeId; const type = config.types.find(t=>requestedTypeId ? t.id===requestedTypeId : t.slug==="ovrigt" && !t.organization_id); setActivityTypeId(activity?.activityTypeId ?? type?.id ?? ""); if(mode==="create" && type) setRules(current=>applyUntouchedDefaults(current,type.defaults,touched.current)); })
      .catch(error=>{if(!controller.signal.aborted)setConfigurationError(error instanceof Error ? error.message : "Inställningarna kunde inte hämtas.");});
    return ()=>controller.abort();
  },[source,team.id,activity?.activityTypeId,draft?.activityTypeId,mode,request]);
  function invalidatePreview() {setDeletePreview(undefined);setSeriesPreview(undefined);setSeriesChanges(undefined);setPreview(undefined);setPayload(undefined);}
  function changeRule(key:keyof ActivityTimingRules,value:string|string[]) { invalidatePreview();touched.current.add(key);setTouchedKeys(new Set(touched.current));setRules(current=>({...current,[key]:value})); }
  function changeActivityType(id:string) { invalidatePreview();setActivityTypeId(id); if(mode==="create") {const defaults=configuration?.types.find(type=>type.id===id)?.defaults;if(defaults)setRules(current=>applyUntouchedDefaults(current,defaults,touched.current));} }

  const formatter=useMemo(()=>new Intl.DateTimeFormat("sv-SE",{timeZone,weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}),[timeZone]);
  const invited=members.filter(member=>selectedPeople.has(member.id));
  const [recipientSearch,setRecipientSearch]=useState("");
  const [dayMode,setDayMode]=useState<"single"|"multi">(end.date!==scheduleDates.startsOn ? "multi" : "single");
  function changeDayMode(next:"single"|"multi") {
    invalidatePreview();setDayMode(next);
    setExplicitEnd({...end,date:next==="single" ? scheduleDates.startsOn : end.date===scheduleDates.startsOn ? shiftCalendarDate(scheduleDates.startsOn,1) : end.date});
  }
  const recipients=members.filter(member=>(member.teamRelation==="player" || member.teamRelation==="leader") && member.displayName.toLocaleLowerCase("sv-SE").includes(recipientSearch.trim().toLocaleLowerCase("sv-SE"))).map(member=>({id:member.id,name:member.displayName,role:member.teamRelation==="player"?"participant":"leader"}));
  const recurring=mode==="create"&&kind==="series";
  const scheduleContext = useMemo(() => {
    try {
      return { starts: previewWeeklySeries({ ...scheduleDates, endsOn:recurring ? scheduleDates.endsOn : scheduleDates.startsOn,
        weekdays:recurring ? scheduleDates.weekdays : [new Date(`${scheduleDates.startsOn}T00:00:00Z`).getUTCDay() || 7],
        timeZone, durationMinutes:1, gatheringMinutesBefore:0 }).map(item => item.startsAt) };
    } catch { return { starts:[], error:"Ange giltigt datum, tid och eventuell serieperiod för att välja kallelsetider." }; }
  }, [scheduleDates, recurring, timeZone]);
  useEffect(()=>{if(source!=="database"||!canManageInvitations)return;request(`/api/team-groups?teamId=${encodeURIComponent(team.id)}`).then(r=>r.ok?r.json():{groups:[],responsibilities:[]}).then(body=>{setGroups(body.groups??[]);setResponsibilities(body.responsibilities??[]);}).catch(()=>{setGroups([]);setResponsibilities([]);});},[canManageInvitations,mode,source,team.id,request]);

  function changeKind(next:"single"|"series") {
    if(next==="series" && invitationMode==="now")setInvitationMode("none");
    setKind(next);setPreview(undefined);setPayload(undefined);
  }

  function togglePerson(id:string) {
    invalidatePreview();setSelectedPeople(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});
  }

  async function prepare(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(deletePreview || pending)return;
    const data=new FormData(event.currentTarget);
    const startsOn=String(data.get("startsOn")), startTime=String(data.get("startTime"));
    try {
      if(source === "database" && (!configuration || !activityTypeId)) throw new Error(configurationError ?? "Vänta tills aktivitetstyperna har hämtats och välj en typ.");
      if(!recurring && dayMode==="single" && end.date!==startsOn) throw new Error("Välj Flerdagars för en aktivitet som slutar nästa dag, eller ändra sluttiden.");
      const timingRules=normalizeActivityTimingRules(recurring ? rules : { ...rules, duration: activityRangeDuration(startsOn, startTime, end.date, end.time, timeZone) });
      const base={startsOn,startTime,timeZone,rules:timingRules};
      let occurrences: NonNullable<typeof preview>=recurring?previewRuleWeeklySeries({...base,endsOn:String(data.get("endsOn")),weekdays:data.getAll("weekdays").map(Number)}):[previewRuleSingleActivity(base)];
      if(recurring && invitationMode==="now")throw new Error("Välj schemaläggning för en aktivitetsserie.");
      const invitationAudience=invitationMode==="schedule"?"selection":undefined;
      const invitationSelection={roles:[...selectedRoles],groupIds:[...selectedGroups],responsibilityTypeIds:[...selectedResponsibilities]};
      if(invitationMode==="schedule"&&!invitationSelection.roles.length&&!invitationSelection.groupIds.length&&!invitationSelection.responsibilityTypeIds.length) throw new Error("Välj minst en målgrupp.");
      if(invitationMode==="now"&&!selectedPeople.size) throw new Error("Välj minst en person att kalla.");
      if(invitationMode==="schedule") {
        const now = Date.now();
        if(mode==="create") occurrences=occurrences.map(item=>prepareInvitationSchedule({...item,reminderSendAt:null},now));
        else if (adapter) occurrences=occurrences.map(item=>prepareInvitationSchedule({...item,reminderSendAt:null},now));
        else occurrences.forEach(item=>requireFutureSchedule({...item,reminderSendAt:null},now));
      }
      if(mode==="edit" && editScope==="following") {
        if(source==="demo")throw new Error("Serieredigering förhandsgranskas med sparade aktiviteter i ett lag.");
        const changes={title:String(data.get("title")),description:String(data.get("description")),location:String(data.get("location")),activityTypeId:activity?.activityTypeId,startsAt:occurrences[0].startsAt,endsAt:occurrences[0].endsAt,gatheringAt:occurrences[0].gatheringAt};
        setPending(true);
        try {
          const r=await request(`/api/activities/${activity?.id}/series`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({preview:true,changes})});
          const result=await r.json();if(!r.ok)throw new Error(result.error);
          setSeriesPreview(result);setSeriesChanges(changes);setError(undefined);
        } finally {setPending(false);}
        return;
      }
      setPreview(occurrences);
      setPayload({teamId:team.id,activityTypeId:activityTypeId || undefined,title:String(data.get("title")),description:String(data.get("description")),location:String(data.get("location")),invitationMode,invitationAudience,invitationSelection:invitationMode==="schedule"?invitationSelection:undefined,personIds:invitationMode==="now"?[...selectedPeople]:undefined,timingRules,startsOn,startTime,timeZone,endsOn:recurring?String(data.get("endsOn")):startsOn,weekdays:recurring?data.getAll("weekdays").map(Number):[new Date(`${startsOn}T00:00:00Z`).getUTCDay()||7]});
      setError(undefined);
    } catch(caught) { setError(caught instanceof Error?caught.message:"Förhandsgranskningen kunde inte skapas"); }
  }

  async function save() {
    if(editScope==="following" && seriesPreview && seriesChanges) {
      setPending(true);setError(undefined);
      try {
        const r=await request(`/api/activities/${activity?.id}/series`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({preview:false,token:seriesPreview.token,changes:seriesChanges})});
        const result=await r.json();if(!r.ok)throw new Error(result.error);
        onNotice(`${result.count} aktiviteter uppdaterades.`);onClose();if (adapter) adapter.onSaved(activity?.id); else window.location.reload();
      } catch(error) {setError(error instanceof Error?error.message:"Serien kunde inte sparas.");invalidatePreview();} finally {setPending(false);}
      return;
    }
    if(!preview?.length||!payload)return;
    setPending(true); setError(undefined);
    if(source==="demo"){onNotice(`${String(payload.title)} förhandsgranskades i demoläge.`);onClose();return;}
    const occurrence=preview[0], endpoint=mode==="edit"?`/api/activities/${activity?.id}`:recurring?"/api/activity-series":"/api/activities";
    const body=mode==="edit"||!recurring?{...payload,...(mode==="edit" && !adapter ? {timingRules:undefined} : {}),gatheringAt:occurrence.gatheringAt,startsAt:occurrence.startsAt,endsAt:occurrence.endsAt}:payload;
    try {
      const response=await request(endpoint,{method:mode==="edit"?"PUT":"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...body,...(adapter ? {revision:adapter.revision} : {})})});
      const result=await response.json();
      if(!response.ok){setError(result.error??"Aktiviteten kunde inte sparas");return;}
      const savedActivityId=activity?.id??result.activity?.id;
      if(savedActivityId&&invitationMode!=="none"&&mode==="edit"&&!adapter){
        const invitationResponse=await request(`/api/activities/${savedActivityId}/invitations`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(invitationMode==="now"?{mode:"now",personIds:[...selectedPeople]}:{mode:"schedule",audience:"selection",selection:payload.invitationSelection,invitationSendMinutesBefore:payload.invitationSendMinutesBefore,responseDueRule:payload.responseDueRule,reminderMinutesBeforeDue:payload.reminderMinutesBeforeDue,reminderMinutesBeforeDueList:payload.reminderMinutesBeforeDueList,timingRules:payload.timingRules})});
        const invitationResult=await invitationResponse.json();
        if(!invitationResponse.ok){setError(invitationResult.error??"Aktiviteten sparades, men kallelsen kunde inte läggas till");return;}
      }
      onNotice(recurring?`${preview.length} aktiviteter skapades.`:mode==="edit"?"Aktiviteten uppdaterades.":"Aktiviteten skapades.");onClose();if (adapter) adapter.onSaved(savedActivityId); else window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Aktiviteten kunde inte sparas. Försök igen.");
    } finally {
      setPending(false);
    }
  }

  async function remove(confirmSeries=false) {
    if(!activity || source==="demo" || editScope===null || pending)return;
    if(editScope==="single" && !window.confirm(adapter ? "Ställ in aktiviteten? Befintliga svar och historik bevaras." : "Ta bort aktiviteten? Om någon redan har svarat blir den i stället markerad som inställd."))return;
    setPending(true);setError(undefined);
    try {
      const following=editScope==="following";
      const response=await request(`/api/activities/${activity.id}${following?"/series":""}`,{
        method:"DELETE",headers:{"content-type":"application/json"},
        body:JSON.stringify(following?{preview:!confirmSeries,token:confirmSeries?deletePreview?.token:undefined}:{reason:"Inställd av ledare",...(adapter ? {revision:adapter.revision} : {})})
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error??"Aktiviteten kunde inte tas bort.");
      if(following && !confirmSeries) {
        invalidatePreview();setDeletePreview(result);return;
      }
      onNotice(following?`${result.deleted} aktiviteter togs bort och ${result.cancelled} ställdes in.`:
        result.disposition==="cancelled"?"Aktiviteten ställdes in.":"Aktiviteten togs bort.");
      onClose();if (adapter) adapter.onSaved(activity?.id); else window.location.reload();
    } catch(error) {
      setDeletePreview(undefined);setError(error instanceof Error?error.message:"Aktiviteten kunde inte tas bort.");
    } finally {setPending(false);}
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section ref={dialogRef} className="modal activity-editor-modal" role="dialog" aria-modal="true" aria-labelledby="activity-editor-title" tabIndex={-1}
      onKeyDown={event => {
        if (event.key === "Escape" && !pending) { event.preventDefault(); onClose(); return; }
        if (event.key !== "Tab") return;
        const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [href]")]
          .filter(element => element.getClientRects().length > 0);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <div className="card-heading"><div><p className="eyebrow">{team.name}</p><h2 id="activity-editor-title">{mode==="edit"?"Redigera aktivitet":"Skapa aktivitet"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Stäng" type="button">✕</button></div>
      {adapter && canManageInvitations ? <p>Kallelser till valda personer visas i appen. Schemalagda kallelser och externa meddelanden skickas inte ännu.</p> : null}
      {draft?<div className="ai-draft-notice"><strong>AI-utkast för granskning</strong><span>Kontrollera särskilt datum, plats och text innan aktiviteten skapas.</span>{draft.sources.length?<div>{draft.sources.map(source=><a href={source.url} key={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div>:<small>Inga webbkällor följde med utkastet.</small>}</div>:null}
      {mode==="edit" && activity?.seriesId ? <fieldset className="activity-series-scope" disabled={pending}><legend>Vilka tillfällen gäller ändringen?</legend><label><input type="radio" name="editScope" checked={editScope==="single"} onChange={()=>{setEditScope("single");invalidatePreview();}}/>Endast denna aktivitet</label><label><input type="radio" name="editScope" checked={editScope==="following"} disabled={new Date(activity.startsAt)<=new Date()} onChange={()=>{setEditScope("following");setInvitationMode("none");setActivityTypeId(activity.activityTypeId ?? "");invalidatePreview();}}/>Denna och kommande aktiviteter</label>{editScope==="following"?<p>Passerade, inställda och individuellt ändrade tillfällen hoppas över. Vald aktivitet ingår. Valet gäller även borttagning. Vid sparande bevaras kallelser och svar; tider flyttas lika mycket i lokal tid.</p>:null}</fieldset>:null}
      <form onSubmit={prepare} onChange={invalidatePreview}>
        {deletePreview?<div className="activity-preview" role="alert"><strong>Ta bort {deletePreview.count} aktiviteter?</strong><p>Tillfällen med svar markeras som inställda. Övriga tas bort. {deletePreview.skipped} tillfällen hoppas över.</p><ol>{deletePreview.activities.map(item=><li key={item.id}>{formatter.format(new Date(item.startsAt))} – {formatter.format(new Date(item.endsAt))}</li>)}</ol><button className="secondary" type="button" disabled={pending} onClick={()=>setDeletePreview(undefined)}>Tillbaka till redigering</button></div>:null}
        <fieldset className="activity-editor-fields" hidden={Boolean(deletePreview)} disabled={pending || editScope===null}>
        {mode==="create" && !adapter?.singleOnly ?<div className="activity-kind-switch" role="group" aria-label="Typ av aktivitet"><button className={kind==="single"?"selected":""} onClick={()=>changeKind("single")} type="button">En aktivitet</button><button className={kind==="series"?"selected":""} onClick={()=>changeKind("series")} type="button">Aktivitetsserie</button></div>:null}
        <section className="editor-section" aria-labelledby="editor-basics-title">
          <div className="workflow-section-heading"><div><h3 id="editor-basics-title">Aktivitetsdetaljer</h3></div><span className="badge">Obligatoriskt</span></div>
          {source === "database" ? <fieldset className="activity-type-picker" disabled={!configuration || editScope==="following"}><legend>Aktivitetstyp</legend><div>{configuration?.types.map(type=><button type="button" key={type.id} aria-pressed={activityTypeId===type.id} onClick={()=>changeActivityType(type.id)}><ActivityTypeIcon category={type.system_category}/>{type.name}</button>)}</div>{!configuration ? <small>Laddar aktivitetstyper…</small> : null}{activity?.activityTypeId && !configuration?.types.some(type=>type.id===activity.activityTypeId) ? <p>Befintlig aktivitetstyp (inaktiv eller annan disciplin)</p> : null}</fieldset> : null}
          {configurationError ? <p className="auth-error" role="alert">{configurationError}</p> : null}
          <div className="editor-fields">
            <label>Titel<input name="title" required defaultValue={draft?.title??activity?.title??""} placeholder="Träning eller match"/></label>
            <label>Plats<input name="location" required defaultValue={draft?.location??activity?.location??""} placeholder="Plan eller hall"/></label>
          </div>
          <details className="editor-optional" open={descriptionOpen} onToggle={event=>setDescriptionOpen(event.currentTarget.open)}><summary>Beskrivning (valfritt)</summary><label className="sr-only" htmlFor="editor-description">Beskrivning</label><textarea id="editor-description" name="description" rows={3} defaultValue={draft?.description??activity?.description??""} placeholder="Praktisk information till deltagarna"/></details>
        </section>
        <section className="editor-section" aria-labelledby="editor-time-title">
          <div className="workflow-section-heading"><div><h3 id="editor-time-title">Tid &amp; samling</h3></div></div>
          {recurring ? <fieldset className="editor-weekdays"><legend>Veckodagar</legend><div className="weekday-options">{weekdayOptions.map(([value,label])=><label key={value}><input type="checkbox" name="weekdays" value={value} checked={scheduleDates.weekdays.includes(value)} onChange={event=>setScheduleDates(current=>({...current,weekdays:event.target.checked ? [...current.weekdays,value] : current.weekdays.filter(day=>day!==value)}))}/>{label}</label>)}</div></fieldset> : null}
          {!recurring ? <DateTimeRangeFields mode={dayMode} onModeChange={changeDayMode} startDate={scheduleDates.startsOn} endDate={end.date} startTime={scheduleDates.startTime} endTime={end.time} names={{startDate:"startsOn",endDate:"activityEndsOn",startTime:"startTime",endTime:"endTime"}} onDatesChange={(startsOn,endsOn)=>{invalidatePreview();setScheduleDates(current=>({...current,startsOn}));if(dayMode==="multi" || explicitEnd)setExplicitEnd({...end,date:endsOn});}} onStartTimeChange={startTime=>{invalidatePreview();setScheduleDates(current=>({...current,startTime}));}} onEndTimeChange={time=>{invalidatePreview();setExplicitEnd({...end,time});}}/> : <>
          <ActivityDatePicker required name="startsOn" value={scheduleDates.startsOn} onChange={startsOn=>{invalidatePreview();setScheduleDates(current=>({...current,startsOn}));}}/>
          <div className="date-field editor-series-end"><span>Serien slutar</span><ActivityDatePicker name="endsOn" label="Serien slutar" required min={scheduleDates.startsOn} value={scheduleDates.endsOn} onChange={endsOn=>{invalidatePreview();setScheduleDates(current=>({...current,endsOn}));}}/></div>
          <div className="editor-time-steppers"><ActivityTimeStepper name="startTime" label="Starttid" value={scheduleDates.startTime} onChange={startTime=>{invalidatePreview();setScheduleDates(current=>({...current,startTime}));}}/></div></>}
          {recurring || dayMode==="single" ? <div className="editor-duration-choices" role="group" aria-label="Passlängd"><span>Passlängd</span>{durationChoices.map(choice=><button type="button" key={choice.value} aria-pressed={durationToMinutes(choice.value)===(recurring?durationToMinutes(rules.duration):currentDuration)} onClick={()=>{changeRule("duration",choice.value);setExplicitEnd(null);}}>{durationToMinutes(choice.value)===90 ? "1,5 tim" : durationToMinutes(choice.value)%60===0 ? `${durationToMinutes(choice.value)/60} tim` : `${durationToMinutes(choice.value)} min`}</button>)}</div> : null}
          <div className="editor-gathering"><p><strong>Samling</strong>{rangeSummary?.gatheringAt ? <span>{clockFormatter.format(new Date(rangeSummary.gatheringAt))}</span> : <span>Vid start</span>}</p><div className="editor-gathering-choices" role="group" aria-label="Samling före start">{gatheringChoices.map(choice=><button type="button" key={choice.value} aria-pressed={rules.gatheringRule===choice.value} onClick={()=>changeRule("gatheringRule",choice.value)}>{choice.value==="start" ? "Vid start" : /^start-\d+m$/.test(choice.value) ? `−${choice.value.slice(6,-1)} min` : choice.label}</button>)}</div>
          {rangeSummary && (recurring || dayMode==="single") ? <div className="editor-timeline"><div><span>Samling {clockFormatter.format(new Date(rangeSummary.gatheringAt ?? rangeSummary.startsAt))} ({rangeSummary.gatheringAt ? Math.round((Date.parse(rangeSummary.startsAt)-Date.parse(rangeSummary.gatheringAt))/60000) : 0} min)</span><span>Aktivitet {clockFormatter.format(new Date(rangeSummary.startsAt))}–{clockFormatter.format(new Date(rangeSummary.endsAt))} ({Math.round((Date.parse(rangeSummary.endsAt)-Date.parse(rangeSummary.startsAt))/60000)} min)</span></div><div className="editor-timeline-bar" aria-hidden="true"><span style={{flex:rangeSummary.gatheringAt ? Math.max(0,(Date.parse(rangeSummary.startsAt)-Date.parse(rangeSummary.gatheringAt))/60000) : 0}}/><span style={{flex:(Date.parse(rangeSummary.endsAt)-Date.parse(rangeSummary.startsAt))/60000}}/></div></div> : null}</div>
          <small>Samlingen räknas före aktivitetens start. Välj kallelse och mottagare nedan.</small>
        </section>
        {canManageInvitations && editScope!=="following" ? <details className="editor-section editor-invitation" open={invitationOpen} onToggle={event=>setInvitationOpen(event.currentTarget.open)}>
          <summary><span className="workflow-summary-title">Kallelse &amp; svarsregler</span> <span>{invitationMode==="none"?(mode==="edit"?"Behåll befintliga":"Ingen"):invitationMode==="now"?"Skicka nu":"Schemalägg"}</span></summary>
          <div className="activity-kind-switch invitation-mode-switch" role="group" aria-label="Kallelse"><button className={invitationMode==="none"?"selected":""} onClick={()=>{invalidatePreview();setInvitationMode("none");}} type="button">{mode==="edit" ? "Behåll befintliga" : "Ingen"}</button><button className={invitationMode==="now"?"selected":""} onClick={()=>{invalidatePreview();setInvitationMode("now");}} disabled={recurring} title={recurring ? "Använd Schemalägg för en serie" : undefined} type="button">{adapter ? "Välj personer" : "Skicka nu"}</button><button className={invitationMode==="schedule"?"selected":""} onClick={()=>{invalidatePreview();setInvitationMode("schedule");}} type="button">Schemalägg</button></div>
          {invitationMode==="now"?<div className="editor-invitation-body">
            <div className="editor-inline-heading"><strong>Välj personer</strong><Help label="Skicka nu">Markera kryssrutan för de personer som ska få kallelsen. Du kan välja spelare och ledare tillsammans.</Help></div>
            <p className="editor-recipient-count" role="status">{invited.length} valda mottagare</p>
            <label className="attendance-search">Sök mottagare<input type="search" value={recipientSearch} onChange={event=>setRecipientSearch(event.target.value)} placeholder="Sök på namn"/></label>
            <PersonSelectionList people={recipients} groups={recipientGroups} selected={selectedPeople} onToggle={togglePerson} quickGroups={groups.map(group=>({id:group.id,label:group.name,personIds:group.personIds??[]}))} onSelectionChange={next=>{invalidatePreview();setSelectedPeople(next);}} disabled={pending} emptyMessage="Inga mottagare matchar sökningen."/>
          </div>:null}
          {invitationMode==="schedule"?<div className="editor-invitation-body">
            <div className="editor-inline-heading"><strong>Målgrupper</strong><Help label="Målgrupper">Valda roller och undergrupper kombineras utan dubletter. Personerna bestäms när kallelsen skickas, så ändringar i laget följer med.</Help></div>
            <div className="audience-options">
              {scheduledRoles.map(role=><label key={role}><input type="checkbox" checked={selectedRoles.has(role)} onChange={()=>setSelectedRoles(current=>{const next=new Set(current);if(next.has(role))next.delete(role);else next.add(role);return next;})}/>{roleLabels[role]}</label>)}
              {responsibilities.map(role=><label key={role.id}><input type="checkbox" checked={selectedResponsibilities.has(role.id)} onChange={()=>setSelectedResponsibilities(current=>{const next=new Set(current);if(next.has(role.id))next.delete(role.id);else next.add(role.id);return next;})}/>{role.name}</label>)}
              {groups.map(group=><label key={group.id}><input type="checkbox" checked={selectedGroups.has(group.id)} onChange={()=>setSelectedGroups(current=>{const next=new Set(current);if(next.has(group.id))next.delete(group.id);else next.add(group.id);return next;})}/>{group.name}</label>)}
            </div>
            <ActivityTimingFields rules={rules} onChange={changeRule} defaults={typeDefaults} touched={touchedKeys} invitations starts={scheduleContext.starts} timeZone={timeZone} contextError={scheduleContext.error}/>
            <small>Kallelse och sista svarstid räknas före aktivitetens start.{mode==="create" ? " Om kallelsetiden redan har passerat skickas kallelsen direkt vid sparande. Passerade påminnelser hoppas över." : ""}</small>
          </div>:null}
        </details> : null}
        {seriesPreview?<div className="activity-preview"><strong>{seriesPreview.count} aktiviteter ändras · {seriesPreview.skipped} hoppas över</strong><ol>{seriesPreview.activities.map(item=><li key={item.id}>{formatter.format(new Date(item.startsAt))} – {formatter.format(new Date(item.endsAt))}</li>)}</ol><p>Befintliga kallelsetider och svar ändras inte.</p></div>:null}
        {error?<p className="auth-error" role="alert">{error}</p>:null}
        {preview?<div className="activity-preview"><p className="eyebrow">Förhandsgranskning · {preview.length} {preview.length===1?"tillfälle":"tillfällen"}</p><ol>{preview.slice(0,12).map(item=><li key={item.startsAt}><strong>{formatter.format(new Date(item.startsAt))}</strong><span>{String(payload?.location)} · Slut: {formatter.format(new Date(item.endsAt))}{item.gatheringAt ? ` · Samling: ${formatter.format(new Date(item.gatheringAt))}` : ""}</span>{invitationMode === "schedule" ? <small>Kallelse: {item.sendImmediately ? "Direkt vid sparande" : formatter.format(new Date(item.invitationSendAt))} · Svar: {formatter.format(new Date(item.responseDueAt))} · Påminnelser: {item.reminderSendAts.map(t=>formatter.format(new Date(t))).join(", ") || "Inga"}</small> : null}</li>)}</ol></div>:null}
        </fieldset>
        <div className="modal-actions">{mode==="edit"?<button className="danger" disabled={pending || editScope===null || deletePreview?.count===0} onClick={()=>void remove(Boolean(deletePreview))} type="button">{deletePreview?"Bekräfta borttagning":editScope==="following"?"Ta bort kommande":adapter?"Ställ in":"Ta bort"}</button>:null}<button className="secondary" onClick={onClose} type="button">Avbryt</button>{deletePreview?null:preview || seriesPreview?<button className="primary" disabled={pending} onClick={()=>void save()} type="button">{pending?"Sparar…":mode==="edit"?"Spara ändring":recurring?`Skapa ${preview?.length ?? 0} aktiviteter`:"Skapa aktivitet"}</button>:<button className="primary" disabled={pending || editScope===null} type="submit">Förhandsgranska</button>}</div>
      </form>
    </section>
  </div>;
}
