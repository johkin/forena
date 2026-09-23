"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Activity, Member, Organization, Team } from "@/domain/club";
import { previewSingleActivity, previewWeeklySeries, type ActivityOccurrence } from "@/lib/activity-series";

type Props = {
  mode: "create" | "edit";
  organization: Organization;
  team: Team;
  members: Member[];
  activity?: Activity;
  source: "database" | "demo";
  onClose: () => void;
  onNotice: (notice: string) => void;
};

const weekdayOptions = [[1, "Mån"], [2, "Tis"], [3, "Ons"], [4, "Tor"], [5, "Fre"], [6, "Lör"], [7, "Sön"]] as const;

function localParts(value: string | undefined, timeZone: string) {
  const date = value ? new Date(value) : new Date();
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function ActivityEditorModal({ mode, organization, team, members, activity, source, onClose, onNotice }: Props) {
  const timeZone = organization.timeZone ?? "Europe/Stockholm";
  const initial = localParts(activity?.startsAt, timeZone);
  const initialDuration = activity ? Math.round((new Date(activity.endsAt).getTime() - new Date(activity.startsAt).getTime()) / 60_000) : 90;
  const initialGathering = activity?.gatheringAt ? Math.max(0, Math.round((new Date(activity.startsAt).getTime() - new Date(activity.gatheringAt).getTime()) / 60_000)) : 0;
  const [recurring, setRecurring] = useState(false);
  const [preview, setPreview] = useState<ActivityOccurrence[]>();
  const [payload, setPayload] = useState<Record<string, unknown>>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const previewFormatter = useMemo(() => new Intl.DateTimeFormat("sv-SE", { timeZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), [timeZone]);

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const startsOn = String(data.get("startsOn"));
    const startTime = String(data.get("startTime"));
    const durationMinutes = Number(data.get("durationMinutes"));
    const gatheringMinutesBefore = Number(data.get("gatheringMinutesBefore"));
    const base = { startsOn, startTime, durationMinutes, gatheringMinutesBefore, timeZone };
    try {
      const occurrences = recurring
        ? previewWeeklySeries({ ...base, endsOn: String(data.get("endsOn")), weekdays: data.getAll("weekdays").map(Number) })
        : [previewSingleActivity(base)];
      const nextPayload = {
        teamId: team.id, title: String(data.get("title")), description: String(data.get("description")), location: String(data.get("location")),
        personIds: data.getAll("personIds").map(String), ...base,
        endsOn: recurring ? String(data.get("endsOn")) : startsOn,
        weekdays: recurring ? data.getAll("weekdays").map(Number) : [new Date(`${startsOn}T00:00:00Z`).getUTCDay() || 7],
      };
      setPreview(occurrences);
      setPayload(nextPayload);
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Förhandsgranskningen kunde inte skapas");
    }
  }

  async function save() {
    if (!preview?.length || !payload) return;
    setPending(true);
    setError(undefined);
    if (source === "demo") {
      onNotice(`${String(payload.title)} förhandsgranskades i demoläge.`);
      onClose();
      return;
    }
    const occurrence = preview[0];
    const endpoint = mode === "edit" ? `/api/activities/${activity?.id}` : recurring ? "/api/activity-series" : "/api/activities";
    const method = mode === "edit" ? "PUT" : "POST";
    const body = mode === "edit" || !recurring
      ? { ...payload, gatheringAt: occurrence.gatheringAt, startsAt: occurrence.startsAt, endsAt: occurrence.endsAt }
      : payload;
    const response = await fetch(endpoint, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    setPending(false);
    if (!response.ok) { setError(result.error ?? "Aktiviteten kunde inte sparas"); return; }
    onNotice(recurring ? `${preview.length} aktiviteter skapades.` : mode === "edit" ? "Aktiviteten uppdaterades." : "Aktiviteten skapades.");
    onClose();
    window.location.reload();
  }

  async function remove() {
    if (!activity || source === "demo" || !window.confirm("Ta bort aktiviteten? Om någon redan har svarat blir den i stället markerad som inställd.")) return;
    setPending(true);
    const response = await fetch(`/api/activities/${activity.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "Inställd av ledare" }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Aktiviteten kunde inte tas bort"); setPending(false); return; }
    onNotice(result.disposition === "cancelled" ? "Aktiviteten ställdes in eftersom svar redan fanns." : "Aktiviteten togs bort.");
    onClose();
    window.location.reload();
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal activity-editor-modal" role="dialog" aria-modal="true" aria-labelledby="activity-editor-title">
      <div className="card-heading"><div><p className="eyebrow">{team.name}</p><h2 id="activity-editor-title">{mode === "edit" ? "Redigera aktivitet" : "Ny aktivitet"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Stäng" type="button">✕</button></div>
      <form onSubmit={prepare} onChange={() => { setPreview(undefined); setPayload(undefined); }}>
        <label>Titel<input name="title" required defaultValue={activity?.title ?? ""} placeholder="Träning eller match" /></label>
        <label>Beskrivning<textarea name="description" rows={3} placeholder="Praktisk information till deltagarna" /></label>
        <label>Plats<input name="location" required defaultValue={activity?.location ?? ""} placeholder="Plan eller hall" /></label>
        {mode === "create" ? <label className="toggle-row"><input type="checkbox" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} /> Återkommande serie</label> : null}
        <div className="form-row"><label>Datum<input name="startsOn" type="date" required defaultValue={initial.date} /></label><label>Start<input name="startTime" type="time" required defaultValue={initial.time} /></label></div>
        <div className="form-row"><label>Längd<select name="durationMinutes" defaultValue={String(initialDuration)}><option value="60">1 timme</option><option value="90">1,5 timmar</option><option value="120">2 timmar</option><option value="180">3 timmar</option></select></label><label>Samling före start<select name="gatheringMinutesBefore" defaultValue={String(initialGathering)}><option value="0">Ingen särskild samling</option><option value="15">15 minuter</option><option value="30">30 minuter</option><option value="45">45 minuter</option><option value="60">60 minuter</option></select></label></div>
        {recurring ? <><fieldset><legend>Veckodagar</legend><div className="weekday-options">{weekdayOptions.map(([value, label]) => <label key={value}><input type="checkbox" name="weekdays" value={value} defaultChecked={value === (new Date(`${initial.date}T00:00:00Z`).getUTCDay() || 7)} />{label}</label>)}</div></fieldset><label>Serien slutar<input name="endsOn" type="date" required defaultValue={initial.date} min={initial.date} /></label></> : null}
        {mode === "create" ? <fieldset><legend>Kalla deltagare</legend><div className="member-options">{members.map((member) => <label key={member.id}><input type="checkbox" name="personIds" value={member.id} defaultChecked /><span className="member-avatar">{member.displayName.slice(0, 1)}</span>{member.displayName}</label>)}</div></fieldset> : null}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        {preview ? <div className="activity-preview"><p className="eyebrow">Förhandsgranskning · {preview.length} {preview.length === 1 ? "tillfälle" : "tillfällen"}</p><ol>{preview.slice(0, 12).map((item) => <li key={item.startsAt}><strong>{previewFormatter.format(new Date(item.startsAt))}</strong><span>{String(payload?.location)}</span></li>)}</ol>{preview.length > 12 ? <small>… och {preview.length - 12} till</small> : null}</div> : null}
        <div className="modal-actions">{mode === "edit" ? <button className="danger" disabled={pending} onClick={() => void remove()} type="button">Ta bort</button> : null}<button className="secondary" onClick={onClose} type="button">Avbryt</button>{preview ? <button className="primary" disabled={pending} onClick={() => void save()} type="button">{pending ? "Sparar…" : mode === "edit" ? "Spara ändring" : recurring ? `Skapa ${preview.length} aktiviteter` : "Skapa aktivitet"}</button> : <button className="primary" type="submit">Förhandsgranska</button>}</div>
      </form>
    </section>
  </div>;
}
