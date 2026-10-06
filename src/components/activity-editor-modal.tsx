Warning: truncated output (original token count: 7659)
Total output lines: 261

"use client";

import { FormEvent, useEffect, useMemo, useState, useRef } from "react";
import type { Activity, Member, Organization, Team } from "@/domain/club";
import { previewWeeklySeries, previewRuleSingleActivity, previewRuleWeeklySeries, type ActivityOccurrence } from "@/lib/activity-series";
import type { ActivityDraft } from "@/lib/ai/activity-draft";
import { attendanceNames } from "@/lib/attendance-names";
import type { AudienceRole } from "@/lib/invitation-audience";
import { FiveMinuteTimeField } from "./five-minute-time-field";
import { ActivityTimingFields } from "./activity-timing-fields";
import type { ActivityConfiguration } from "@/lib/activity-configuration";
import { FALLBACK_ACTIVITY_DEFAULTS } from "@/lib/activity-defaults";
import { applyUntouchedDefaults } from "@/lib/activity-editor-defaults";
import { durationToMinutes, localActivityTime, normalizeActivityTimingRules, type ActivityTimingRules } from "@/lib/activity-time-rules";
import { requireFutureSchedule } from "@/lib/activity-schedule";
import { activityRangeDuration } from "@/lib/activity-range";
import { useModalScrollLock } from "@/lib/use-modal-scroll-lock";

type Props = { mode: "create" | "edit"; organization: Organization; team: Team; members: Member[]; activity?: Activity; draft?: ActivityDraft; source: "database" | "demo"; canManageInvitations: boolean; onClose: () => void; onNotice: (notice: string) => void; };
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
  return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${value ? parts.minute : String(Math.floor(Number(parts.minute)/5)*5).padStart(2,"0")}`};
}

export function ActivityEditorModal({mode,organization,team,members,activity,draft,source,canManageInvitations,onClose,onNotice}:Props) {
  useModalScrollLock();
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
  const [preview,setPreview]=useState<(ActivityOccurrence & { invitationSendAt:string;responseDueAt:string;reminderSendAts:string[] })[]>();
  const [payload,setPayload]=useState<Record<string,unknown>>();
  const [pending,setPending]=useState(false);
  const [error,setError]=useState<string>();
  const [groups,setGroups]=useState<{id:string;name:string}[]>([]);
  const [responsibilities,setResponsibilities]=useState<{id:string;name:string}[]>([]);
  const [selectedRoles,setSelectedRoles]=useState<Set<AudienceRole>>(new Set());
  const [selectedGroups,setSelectedGroups]=useState<Set<string>>(new Set());
  const [selectedResponsibilities,setSelectedResponsibilities]=useState<Set<string>>(new Set());
  const [invitationMode,setInvitationMode]=useState<"none"|"now"|"schedule">("none");
  const [selectedPeople,setSelectedPeople]=useState<Set<string>>(new Set());
  const [descriptionOpen,setDescriptionOpen]=useState(Boolean(draft?.description||activity?.description));
  const [invitationOpen,setInvitationOpen]=useState(canManageInvitations && mode==="create");
  const [configuration,setConfiguration] = useState<ActivityConfiguration>();
  const [configurationError,setConfigurationError] = useState<string>();
  const [activityTypeId,setActivityTypeId] = useState(activity?.activityTypeId ?? draft?.activityTypeId ?? "");
  const touched = useRef(new Set<keyof ActivityTimingRules>(mode === "edit" || draft ? ["duration","gatheringRule"] : []));
  const [touchedKeys,setTouchedKeys] = useState(new Set<keyof ActivityTimingRules>(mode === "edit" || draft ? ["duration","gatheringRule"] : []));
  const [rules,setRules] = useState<ActivityTimingRules>({ ...FALLBACK_ACTIVITY_DEFAULTS, duration:`PT${initialDuration}M`,gatheringRule:initialGathering ? `start-${initialGathering}m` : "start",reminderRules:[...FALLBACK_ACTIVITY_DEFAULTS.reminderRules] });
  const [explicitEnd, setExplicitEnd] = useState<{ date: string; time: string } | null>(activity ? localParts(activity.endsAt, timeZone) : null);
  const end = explicitEnd ?? (() => {
    try { return localParts(new Date(localActivityTime(scheduleDates.startsOn, scheduleDates.startTime, timeZone).getTime() + durationToMinutes(rules.duration) * 60000).toISOString(), timeZone); }
    catch { return { date: scheduleDates.startsOn, time: scheduleDates.startTime }; }
  })();
  const typeDefaults = configuration?.types.find(type=>type.id===activityTypeId)?.defaults;
  useEffect(()=>{
    if (source !== "database") return;
    const controller = new AbortController();
    fetch(`/api/activity-configuration?teamId=${encodeURIComponent(team.id)}`,{signal:controller.signal})
      .then(async response=> { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result as ActivityConfiguration; })
      .then(config=> { setConfiguration(config); const requestedTypeId = activity?.activityTypeId ?? draft?.activityTypeId; const type = config.types.find(t=>requestedTypeId ? t.id===requestedTypeId : t.slug==="ovrigt" && !t.organization_id); setActivityTypeId(activity?.activityTypeId ?? type?.id ?? ""); if(mode==="create" && type) setRules(current=>applyUntouchedDefaults(current,type.defaults,touched.current)); })
      .catch(error=>{if(!controller.signal.aborted)setConfigurationError(error instanceof Error ? error.message : "Inställningarna kunde inte hämtas.");});
    return ()=>controller.abort();
  },[source,team.id,activity?.activityTypeId,draft?.activityTypeId,mode]);
  function invalidatePreview() {setDeletePreview(undefined);setSeriesPreview(undefined);setSeriesChanges(undefined);setPreview(undefined);setPayload(undefined);}
  function changeRule(key:keyof ActivityTimingRules,value:string|string[]) { invalidatePreview();touched.current.add(key);setTouchedKeys(new Set(touched.current));setRules(current=>({...current,[key]:value})); }
  function changeActivityType(id:string) { invalidatePreview();setActivityTypeId(id); if(mode==="create") {const defaults=configuration?.types.find(type=>type.id===id)?.defaults;if(defaults)setRules(current=>applyUntouchedDefaults(current,defaults,touched.current));} }

  const formatter=useMemo(()=>new Intl.DateTimeFormat("sv-SE",{timeZone,weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}),[timeZone]);
  const names=useMemo(()=>attendanceNames(members.map(member=>({personId:member.id,displayName:member.displayName}))),[members]);
  const invited=members.filter(member=>selectedPeople.has(member.id));
  const available=members.filter(member=>!selectedPeople.has(member.id));
  const recurring=mode==="create"&&kind==="series";
  const scheduleContext = useMemo(() => {
    try {
      return { starts: previewWeeklySeries({ ...scheduleDates, endsOn:recurring ? scheduleDates.endsOn : scheduleDates.startsOn,
        weekdays:recurring ? scheduleDates.weekdays : [new Date(`${scheduleDates.startsOn}T00:00:00Z`).getUTCDay() || 7],
        timeZone, durationMinutes:1, gatheringMinutesBefore:0 }).map(item => item.startsAt) };
    } catch { return { starts:[], error:"Ange giltigt datum, tid och eventuell serieperiod för att välja kallelsetider." }; }
  }, [scheduleDates, recurring, timeZone]);
  useEffect(()=>{if(source!=="database"||!canManageInvitations)return;fetch(`/api/team-groups?teamId=${encodeURIComponent(team.id)}`).then(r=>r.ok?r.json():{groups:[],responsibilities:[]}).then(body=>{setGroups(body.groups??[]);setResponsibilities(body.responsibilities??[]);}).catch(()=>{setGroups([]);setResponsibilities([]);});},[canManageInvitations,mode,source,team.id]);

  function changeKind(next:"single"|"series") {
    if(next==="series" && invitationMode==="now")setInvitationMode("none");
    setKind(next);setPreview(undefined);setPayload(undefined);
  }

  function togglePerson(id:string) {
    invalidatePreview();setSelectedPeople(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});
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


  async function prepare(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(deletePreview || pending)return;
    const data=new FormData(event.currentTarget);
    const startsOn=String(data.get("startsOn")), startTime=String(data.get("startTime"));
    try {
      if(source === "database" && (!configuration || !activityTypeId)) throw new Error(configurationError ?? "Vänta tills aktivitetstyperna har hämtats och välj en typ.");
      const timingRules=normalizeActivityTimingRules(recurring ? rules : { ...rules, duration: activityRangeDuration(startsOn, startTime, end.date, end.time, timeZone) });
      const base={startsOn,startTime,timeZone,rules:timingRules};
      const occurrences=recurring?previewRuleWeeklySeries({...base,endsOn:String(data.get("endsOn")),weekdays:data.getAll("weekdays").map(Number)}):[previewRuleSingleActivity(base)];
      if(recurring && invitationMode==="now")throw new Error("Välj schemaläggning för en aktivitetsserie.");
      const invitationAudience=invitationMode==="schedule"?"selection":undefined;
      const invitationSelection={roles:[...selectedRoles],groupIds:[...selectedGroups],responsibilityTypeIds:[...selectedResponsibilities]};
      if(invitationMode==="schedule"&&!invitationSelection.roles.length&&!invitationSelection.groupIds.length&&!invitationSelection.responsibilityTypeIds.length) throw new Error("Välj minst en målgrupp.");
      if(invitationMode==="now"&&!selectedPeople.size) throw new Error("Välj minst en person att kalla.");
      if(invitationMode==="schedule") occurrences.forEach(item=>requireFutureSchedule({...item,reminderSendAt:null}));
      if(mode==="edit" && editScope==="following") {
        if(source==="demo")throw new Error("Serieredigering förhandsgranskas med sparade aktiviteter i ett lag.");
        const changes={title:String(data.get("title")),description:String(data.get("description")),location:String(data.get("location")),activityTypeId:activity?.activityTypeId,startsAt:occurrences[0].startsAt,endsAt:occurrences[0].endsAt,gatheringAt:occurrences[0].gatheringAt};
        setPending(true);
        try {
          const r=await fetch(`/api/activities/${activity?.id}/series`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({preview:true,changes})});
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

  async functio…659 tokens truncated…e(confirmSeries=false) {
    if(!activity || source==="demo" || editScope===null || pending)return;
    if(editScope==="single" && !window.confirm("Ta bort aktiviteten? Om någon redan har svarat blir den i stället markerad som inställd."))return;
    setPending(true);setError(undefined);
    try {
      const following=editScope==="following";
      const response=await fetch(`/api/activities/${activity.id}${following?"/series":""}`,{
        method:"DELETE",headers:{"content-type":"application/json"},
        body:JSON.stringify(following?{preview:!confirmSeries,token:confirmSeries?deletePreview?.token:undefined}:{reason:"Inställd av ledare"})
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error??"Aktiviteten kunde inte tas bort.");
      if(following && !confirmSeries) {
        invalidatePreview();setDeletePreview(result);return;
      }
      onNotice(following?`${result.deleted} aktiviteter togs bort och ${result.cancelled} ställdes in.`:
        result.disposition==="cancelled"?"Aktiviteten ställdes in eftersom svar redan fanns.":"Aktiviteten togs bort.");
      onClose();window.location.reload();
    } catch(error) {
      setDeletePreview(undefined);setError(error instanceof Error?error.message:"Aktiviteten kunde inte tas bort.");
    } finally {setPending(false);}
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="modal activity-editor-modal" role="dialog" aria-modal="true" aria-labelledby="activity-editor-title">
      <div className="card-heading"><div><p className="eyebrow">{team.name}</p><h2 id="activity-editor-title">{mode==="edit"?"Redigera aktivitet":"Ny aktivitet"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Stäng" type="button">✕</button></div>
      {draft?<div className="ai-draft-notice"><strong>AI-utkast för granskning</strong><span>Kontrollera särskilt datum, plats och text innan aktiviteten skapas.</span>{draft.sources.length?<div>{draft.sources.map(source=><a href={source.url} key={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div>:<small>Inga webbkällor följde med utkastet.</small>}</div>:null}
      {mode==="edit" && activity?.seriesId ? <fieldset className="activity-series-scope" disabled={pending}><legend>Vilka tillfällen gäller ändringen?</legend><label><input type="radio" name="editScope" checked={editScope==="single"} onChange={()=>{setEditScope("single");invalidatePreview();}}/>Endast denna aktivitet</label><label><input type="radio" name="editScope" checked={editScope==="following"} disabled={new Date(activity.startsAt)<=new Date()} onChange={()=>{setEditScope("following");setInvitationMode("none");setActivityTypeId(activity.activityTypeId ?? "");invalidatePreview();}}/>Denna och kommande aktiviteter</label>{editScope==="following"?<p>Passerade, inställda och individuellt ändrade tillfällen hoppas över. Vald aktivitet ingår. Valet gäller även borttagning. Vid sparande bevaras kallelser och svar; tider flyttas lika mycket i lokal tid.</p>:null}</fieldset>:null}
      <form onSubmit={prepare} onChange={invalidatePreview}>
        {deletePreview?<div className="activity-preview" role="alert"><strong>Ta bort {deletePreview.count} aktiviteter?</strong><p>Tillfällen med svar markeras som inställda. Övriga tas bort. {deletePreview.skipped} tillfällen hoppas över.</p><ol>{deletePreview.activities.map(item=><li key={item.id}>{formatter.format(new Date(item.startsAt))} – {formatter.format(new Date(item.endsAt))}</li>)}</ol><button className="secondary" type="button" disabled={pending} onClick={()=>setDeletePreview(undefined)}>Tillbaka till redigering</button></div>:null}
        <fieldset className="activity-editor-fields" hidden={Boolean(deletePreview)} disabled={pending || editScope===null}>
        {mode==="create"?<div className="activity-kind-switch" role="group" aria-label="Typ av aktivitet"><button className={kind==="single"?"selected":""} onClick={()=>changeKind("single")} type="button">En aktivitet</button><button className={kind==="series"?"selected":""} onClick={()=>changeKind("series")} type="button">Aktivitetsserie</button></div>:null}
        <section className="editor-section" aria-labelledby="editor-basics-title">
          <h3 id="editor-basics-title">Aktivitet</h3>
          {source === "database" ? <label>Aktivitetstyp<select required value={activityTypeId} onChange={e=>changeActivityType(e.target.value)} disabled={!configuration || editScope==="following"}><option value="">Välj aktivitetstyp</option>{activity?.activityTypeId && !configuration?.types.some(t=>t.id===activity.activityTypeId) ? <option value={activity.activityTypeId}>Befintlig aktivitetstyp (inaktiv eller annan disciplin)</option> : null}{configuration?.types.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label> : null}
          {configurationError ? <p className="auth-error" role="alert">{configurationError}</p> : null}
          <div className="editor-fields">
            <label>Titel<input name="title" required defaultValue={draft?.title??activity?.title??""} placeholder="Träning eller match"/></label>
            <label>Plats<input name="location" required defaultValue={draft?.location??activity?.location??""} placeholder="Plan eller hall"/></label>
          </div>
          <details className="editor-optional" open={descriptionOpen} onToggle={event=>setDescriptionOpen(event.currentTarget.open)}><summary>Beskrivning (valfritt)</summary><label className="sr-only" htmlFor="editor-description">Beskrivning</label><textarea id="editor-description" name="description" rows={3} defaultValue={draft?.description??activity?.description??""} placeholder="Praktisk information till deltagarna"/></details>
        </section>
        <section className="editor-section" aria-labelledby="editor-time-title">
          <h3 id="editor-time-title">Start och slut</h3>
          {recurring?<><fieldset><legend>Veckodagar</legend><div className="weekday-options">{weekdayOptions.map(([value,label])=><label key={value}><input type="checkbox" name="weekdays" value={value} checked={scheduleDates.weekdays.includes(value)} onChange={event=>setScheduleDates(current=>({...current,weekdays:event.target.checked ? [...current.weekdays,value] : current.weekdays.filter(day=>day!==value)}))}/>{label}</label>)}</div></fieldset><div className="form-row editor-date-row"><label>Startdatum<input name="startsOn" type="date" required value={scheduleDates.startsOn} onChange={event=>setScheduleDates(current=>({...current,startsOn:event.target.value}))}/></label><label>Slutdatum<input name="endsOn" type="date" required min={scheduleDates.startsOn} value={scheduleDates.endsOn} onChange={event=>setScheduleDates(current=>({...current,endsOn:event.target.value}))}/></label></div><div className="editor-time-field"><FiveMinuteTimeField name="startTime" label="Starttid" defaultValue={scheduleDates.startTime} onChange={value=>setScheduleDates(current=>({...current,startTime:value}))}/></div></>:<div className="form-row editor-date-row"><label>Startdatum<input name="startsOn" type="date" required value={scheduleDates.startsOn} onChange={event=>setScheduleDates(current=>({...current,startsOn:event.target.value}))}/></label><div className="editor-time-field"><FiveMinuteTimeField name="startTime" label="Starttid" defaultValue={scheduleDates.startTime} onChange={value=>setScheduleDates(current=>({...current,startTime:value}))}/></div></div>}
          {!recurring && <div className="form-row editor-date-row"><label>Slutdatum<input name="activityEndsOn" type="date" required min={scheduleDates.startsOn} value={end.date} onChange={event => setExplicitEnd({ ...end, date: event.target.value })} /></label><div className="editor-time-field"><FiveMinuteTimeField name="endTime" label="Sluttid" defaultValue={end.time} value={end.time} onChange={time => setExplicitEnd({ ...end, time })} /></div></div>}
          <ActivityTimingFields rules={rules} onChange={changeRule} defaults={typeDefaults} touched={touchedKeys} invitations={false} showDuration={recurring}/>
          <small>Samlingen räknas före aktivitetens start. Välj kallelse och mottagare nedan.</small>
        </section>
        {canManageInvitations && editScope!=="following" ? <details className="editor-section editor-invitation" open={invitationOpen} onToggle={event=>setInvitationOpen(event.currentTarget.open)}>
          <summary>Kallelse <span>{invitationMode==="none"?"Ingen":invitationMode==="now"?"Skicka nu":"Schemalägg"}</span></summary>
          <div className="activity-kind-switch invitation-mode-switch" role="group" aria-label="Kallelse"><button className={invitationMode==="none"?"selected":""} onClick={()=>{invalidatePreview();setInvitationMode("none");}} type="button">Ingen</button><button className={invitationMode==="now"?"selected":""} onClick={()=>{invalidatePreview();setInvitationMode("now");}} disabled={recurring} title={recurring ? "Använd Schemalägg för en serie" : undefined} type="button">Skicka nu</button><button className={invitationMode==="schedule"?"selected":""} onClick={()=>{invalidatePreview();setInvitationMode("schedule");}} type="button">Schemalägg</button></div>
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
            <ActivityTimingFields rules={rules} onChange={changeRule} defaults={typeDefaults} touched={touchedKeys} invitations starts={scheduleContext.starts} timeZone={timeZone} contextError={scheduleContext.error}/>
            <small>Kallelse och sista svarstid räknas före aktivitetens start.</small>
          </div>:null}
        </details> : null}
        {seriesPreview?<div className="activity-preview"><strong>{seriesPreview.count} aktiviteter ändras · {seriesPreview.skipped} hoppas över</strong><ol>{seriesPreview.activities.map(item=><li key={item.id}>{formatter.format(new Date(item.startsAt))} – {formatter.format(new Date(item.endsAt))}</li>)}</ol><p>Befintliga kallelsetider och svar ändras inte.</p></div>:null}
        {error?<p className="auth-error" role="alert">{error}</p>:null}
        {preview?<div className="activity-preview"><p className="eyebrow">Förhandsgranskning · {preview.length} {preview.length===1?"tillfälle":"tillfällen"}</p><ol>{preview.slice(0,12).map(item=><li key={item.startsAt}><strong>{formatter.format(new Date(item.startsAt))}</strong><span>{String(payload?.location)} · Slut: {formatter.format(new Date(item.endsAt))}{item.gatheringAt ? ` · Samling: ${formatter.format(new Date(item.gatheringAt))}` : ""}</span>{invitationMode === "schedule" ? <small>Kallelse: {formatter.format(new Date(item.invitationSendAt))} · Svar: {formatter.format(new Date(item.responseDueAt))} · Påminnelser: {item.reminderSendAts.map(t=>formatter.format(new Date(t))).join(", ") || "Inga"}</small> : null}</li>)}</ol></div>:null}
        </fieldset>
        <div className="modal-actions">{mode==="edit"?<button className="danger" disabled={pending || editScope===null || deletePreview?.count===0} onClick={()=>void remove(Boolean(deletePreview))} type="button">{deletePreview?"Bekräfta borttagning":editScope==="following"?"Ta bort kommande":"Ta bort"}</button>:null}<button className="secondary" onClick={onClose} type="button">Avbryt</button>{deletePreview?null:preview || seriesPreview?<button className="primary" disabled={pending} onClick={()=>void save()} type="button">{pending?"Sparar…":mode==="edit"?"Spara ändring":recurring?`Skapa ${preview?.length ?? 0} aktiviteter`:"Skapa aktivitet"}</button>:<button className="primary" disabled={pending || editScope===null} type="submit">Förhandsgranska</button>}</div>
      </form>
    </section>
  </div>;
}
