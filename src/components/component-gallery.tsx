"use client";

import { SectionTeamAdministrationExamples } from "./section-team-administration-examples";
import { useState } from "react";
import { PersonSelectionList } from "./person-selection-list";
import { ActivityTimingFields } from "./activity-timing-fields";
import { DisciplineDefaultsFields } from "./discipline-defaults-fields";
import { resolveDisciplineDefaults } from "@/lib/discipline-defaults";
import type { ActivityTimingRules } from "@/lib/activity-time-rules";
import { ActivityDatePicker } from "./activity-date-picker";
import { ActivityTimeStepper } from "./activity-time-stepper";
import { DateTimeRangeFields } from "./date-time-range-fields";
import { ActivityEditorModal } from "@/components/activity-editor-modal";
import { ActivityDetailModal } from "@/components/activity-detail-modal";
import { ActivityStaffingList } from "@/components/activity-staffing-list";
import { AssistantReminderDraftCard } from "@/components/assistant-reminder-draft-card";
import type { ReminderDraft } from "@/lib/ai/reminder-draft";
import type { Activity, Organization, Team } from "@/domain/club";

const organization: Organization = { id: "example", slug: "exempel", name: "Exempelföreningen", assistantName: "Assistent", timeZone: "Europe/Stockholm" };
const team: Team = { id: "example-team", organizationId: organization.id, sectionId: "example-section", slug: "exempellaget", name: "Exempellaget", season: "2026" };
const activity: Activity = { id: "example-activity", organizationId: organization.id, teamId: team.id, title: "Träning på hemmaplan", startsAt: "2026-10-05T15:00:00Z", endsAt: "2026-10-05T16:00:00Z", gatheringAt: "2026-10-05T14:45:00Z", location: "Idrottsplatsen", seriesId: "example-series" };
const invitees = [
  { personId: "1", displayName: "Johan Kindgren", role: "leader", response: "accepted" },
  { personId: "2", displayName: "Elsa Andersson", role: "participant", response: "accepted" },
  { personId: "3", displayName: "Elsa Johansson", role: "participant", response: "pending" },
  { personId: "4", displayName: "Tilda Kindgren", role: "participant", response: "declined" },
] as const;

const selectionPeople = [
  { id: "coach-1", name: "Alex Andersson", role: "leader", detail: "Tränare · Grupp Grön" },
  { id: "coach-2", name: "Kim Berg", role: "leader", detail: "Lagledare · Grupp Vit" },
  { id: "player-1", name: "Alva Lind", role: "player", detail: "Grupp Grön" },
  { id: "player-2", name: "Ella Holm", role: "player", detail: "Grupp Grön" },
  { id: "player-3", name: "Maja Ek", role: "player", detail: "Grupp Vit" },
  { id: "player-4", name: "Nora Berg", role: "player", detail: "Grupp Vit" },
];
const selectionGroups = [{ role: "leader", label: "Ledare" }, { role: "player", label: "Spelare" }];
const selectionSubgroups = [
  { id: "green", label: "Grupp Grön", personIds: ["coach-1", "player-1", "player-2"] },
  { id: "white", label: "Grupp Vit", personIds: ["coach-2", "player-3", "player-4"] },
];

const reminderDraft: ReminderDraft = {
  timeZone: "Europe/Stockholm",
  assessment: { teamId: "example-team", activityId: "example-activity", title: "Söndagens match på idrottsplatsen med ett långt aktivitetsnamn", activityType: "Match", startsAt: "2026-10-11T09:00:00Z", responseDueAt: "2026-10-09T18:00:00Z",
    accepted: 7, declined: 2, pending: 4, acceptedPlayers: 5, pendingPlayers: 4, lastReminderAt: null, canRemind: true, blockedReason: null, fingerprint: "example" },
  reason: "Fem spelare har tackat ja. Lagets önskemål är minst nio till match, och fyra spelare har ännu inte svarat.",
  memories: [{ scope: "team", subject: "Matchtrupp", content: "Till matcher vill vi ha minst nio spelare. Följ upp obesvarade kallelser om truppen är för liten.", disciplineId: "football" }],
};

/** Demonstrate production UI components with synthetic data and local interactions. */
export function ComponentGallery() {
  const defaults = resolveDisciplineDefaults({activityTypeId:"example",organizationId:"example",sectionId:"example",teamId:"example"}, []);
  const [timing, setTiming] = useState<ActivityTimingRules>(defaults.rules);
  const [date, setDate] = useState("2026-10-16");
  const [pointDate, setPointDate] = useState("2026-10-16");
  const [pointTime, setPointTime] = useState("09:00");
  const [time, setTime] = useState("17:00");
  const [range, setRange] = useState({ start: "2026-10-16", end: "2026-10-18", startTime: "17:00", endTime: "18:00" });
  const [dayMode, setDayMode] = useState<"single" | "multi">("multi");
  const [dialog, setDialog] = useState<"create" | "edit" | "detail">();
  const [selectedPeople, setSelectedPeople] = useState(new Set(["coach-1", "player-1", "player-2"]));
  const [notice, setNotice] = useState("Prova en knapp.");
  return <>
    <section className="design-introduction"><p className="eyebrow">Förena · Designsystem</p><h2>Varmt, tydligt och nära laget</h2><p>Skogsgrönt, ljusa naturtoner och stora tryckytor. Referenserna visar designens riktning; exemplen nedan använder appens riktiga komponenter.</p><div className="component-example-actions"><a className="secondary" href="/design/components-desktop.html">Desktopreferens</a><a className="secondary" href="/design/components-mobile.html">Mobilreferens</a></div><div className="design-swatches"><span className="design-swatch-primary">Skogsgrönt</span><span className="design-swatch-lime">Lime</span><span className="design-swatch-surface">Varm ljus yta</span></div></section>
    <section><h2>Status &amp; räknare</h2><div className="component-example-actions"><span className="status accepted">Kommer</span><span className="status declined">Kan inte</span><span className="status pending">Ej svarat</span><span className="badge">3</span></div><div className="summary"><div><strong>12</strong><span>kommer</span></div><div><strong>2</strong><span>kan inte</span></div><div><strong>3</strong><span>ej svarat</span></div><div><strong>17</strong><span>kallade</span></div></div><p className="design-callout">Tre personer har ännu inte svarat på kallelsen.</p></section>
    <section><h2>Knappar</h2><div className="component-example-actions">
      <button className="primary" onClick={() => setNotice("Primär åtgärd vald.")}>Primär</button>
      <button className="secondary" onClick={() => setNotice("Sekundär åtgärd vald.")}>Sekundär</button>
      <button className="danger" onClick={() => setNotice("Exempel på borttagning. Ingen data ändrades.")}>Ta bort</button>
      <button className="secondary" disabled>Inaktiverad</button>
    </div><p role="status">{notice}</p></section>
    <SectionTeamAdministrationExamples/>
    <section><h2>Formulärfält</h2><div className="component-fields">
      <label>Titel<input placeholder="Träning eller match" /></label>
      <label>Längd<select defaultValue="60"><option value="60">1 timme</option><option value="90">1,5 timmar</option></select></label>
    </div><details><summary>Beskrivning (valfritt)</summary><p>Extra uppgifter visas när de behövs.</p></details></section>
    <section id="date-time-components"><h2>Datum och tid</h2><div className="component-date-examples">
      <div><h3>Tidsintervall</h3><DateTimeRangeFields mode={dayMode} onModeChange={mode => { setDayMode(mode); if (mode === "single") setRange(current => ({ ...current, end: current.start })); }} startDate={range.start} endDate={range.end} startTime={range.startTime} endTime={range.endTime} onDatesChange={(start, end) => setRange(current => ({ ...current, start, end }))} onStartTimeChange={startTime => setRange(current => ({ ...current, startTime }))} onEndTimeChange={endTime => setRange(current => ({ ...current, endTime }))} /></div>
      <div><h3>En tidpunkt</h3><DateTimeRangeFields mode="single" startDate={pointDate} endDate={pointDate} startTime={pointTime} endTime={pointTime} onDatesChange={setPointDate} onStartTimeChange={setPointTime} startLabel="Tid" /></div>
      <div><h3>Enbart datum</h3><ActivityDatePicker name="exampleDate" value={date} onChange={setDate} /></div>
      <div><h3>Enbart klockslag</h3><div className="standalone-time-field"><ActivityTimeStepper name="exampleTime" label="Tid" value={time} onChange={setTime} /></div></div>
    </div></section>
    <section><h2>Tider för kallelse</h2><ActivityTimingFields rules={timing} defaults={defaults} touched={new Set()} invitations starts={[activity.startsAt]} timeZone="Europe/Stockholm" onChange={(key, value) => setTiming(current => ({...current, [key]:value}))}/></section>
    <section><h2>Aktivitetsförval</h2><DisciplineDefaultsFields initial={{}} resolved={defaults}/></section>
    <section id="person-selection-components"><h2>Välj personer</h2><p>Välj en hel grupp eller justera enskilda personer. Undergrupper kan innehålla både ledare och spelare.</p>
      <div className="component-person-example">
        <PersonSelectionList people={selectionPeople} groups={selectionGroups} quickGroups={selectionSubgroups} selected={selectedPeople} onSelectionChange={setSelectedPeople} onToggle={id => setSelectedPeople(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} />
        <div className="person-selection-summary"><span role="status">{selectedPeople.size} av {selectionPeople.length} personer valda</span><button type="button" className="secondary" disabled={!selectedPeople.size} onClick={() => setSelectedPeople(new Set())}>Rensa val</button></div>
      </div>
    </section>
    <section><h2>Bemanning</h2><ActivityStaffingList invitees={[...invitees]} /></section>
    <section><h2>Assistentens påminnelseförslag</h2><p>Exempel med syntetiska minnen. Knapparna skickar ingenting.</p><div className="card assistant-card team-chat-card"><div className="assistant-message"><AssistantReminderDraftCard draft={reminderDraft} demo /></div></div></section>
    <section><h2>Aktivitetsdialoger</h2><p>Den riktiga aktivitetsredigeraren körs i demoläge. Inga aktiviteter eller kallelser sparas.</p><div className="component-example-actions">
      <button className="secondary" onClick={() => setDialog("detail")}>Visa aktivitet</button>
      <button className="primary" onClick={() => setDialog("create")}>Ny aktivitet</button>
    </div></section>
    {dialog === "create" || dialog === "edit" ? <ActivityEditorModal mode={dialog} activity={dialog === "edit" ? activity : undefined} organization={organization} team={team} members={invitees.map(person => ({ id: person.personId, organizationId: organization.id, displayName: person.displayName, teamRelation: person.role === "leader" ? "leader" : "player" }))} source="demo" canManageInvitations onClose={() => setDialog(undefined)} onNotice={setNotice} /> : null}
    {dialog === "detail" ? <ActivityDetailModal activity={activity} organization={organization} team={team} canManageActivity canManageInvitations={false} canManageAttendance={false} rosterMembers={[]} onClose={() => setDialog(undefined)} onEdit={() => setDialog("edit")} /> : null}
  </>;
}
