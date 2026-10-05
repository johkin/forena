"use client";

import { useState } from "react";
import { ActivityTimingFields } from "./activity-timing-fields";
import { ActivityDefaultsFields } from "./activity-defaults-fields";
import { resolveActivityDefaults } from "@/lib/activity-defaults";
import type { ActivityTimingRules } from "@/lib/activity-time-rules";
import { FiveMinuteTimeField } from "@/components/five-minute-time-field";
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

const reminderDraft: ReminderDraft = {
  timeZone: "Europe/Stockholm",
  assessment: { teamId: "example-team", activityId: "example-activity", title: "Söndagens match på idrottsplatsen med ett långt aktivitetsnamn", activityType: "Match", startsAt: "2026-10-11T09:00:00Z", responseDueAt: "2026-10-09T18:00:00Z",
    accepted: 7, declined: 2, pending: 4, acceptedPlayers: 5, pendingPlayers: 4, lastReminderAt: null, canRemind: true, blockedReason: null, fingerprint: "example" },
  reason: "Fem spelare har tackat ja. Lagets önskemål är minst nio till match, och fyra spelare har ännu inte svarat.",
  memories: [{ scope: "team", subject: "Matchtrupp", content: "Till matcher vill vi ha minst nio spelare. Följ upp obesvarade kallelser om truppen är för liten.", disciplineId: "football" }],
};

export function ComponentGallery() {
  const defaults = resolveActivityDefaults({activityTypeId:"example",organizationId:"example",sectionId:"example",teamId:"example"}, []);
  const [timing, setTiming] = useState<ActivityTimingRules>(defaults.rules);
  const [dialog, setDialog] = useState<"create" | "edit" | "detail">();
  const [notice, setNotice] = useState("Prova en knapp.");
  return <>
    <section><h2>Knappar</h2><div className="component-example-actions">
      <button className="primary" onClick={() => setNotice("Primär åtgärd vald.")}>Primär</button>
      <button className="secondary" onClick={() => setNotice("Sekundär åtgärd vald.")}>Sekundär</button>
      <button className="danger" onClick={() => setNotice("Exempel på borttagning. Ingen data ändrades.")}>Ta bort</button>
      <button className="secondary" disabled>Inaktiverad</button>
    </div><p role="status">{notice}</p></section>
    <section><h2>Formulärfält</h2><div className="component-fields">
      <label>Titel<input placeholder="Träning eller match" /></label>
      <label>Datum<input type="date" defaultValue="2026-10-05" /></label>
      <FiveMinuteTimeField name="exampleTime" defaultValue="17:00"/>
      <label>Längd<select defaultValue="60"><option value="60">1 timme</option><option value="90">1,5 timmar</option></select></label>
    </div><details><summary>Beskrivning (valfritt)</summary><p>Extra uppgifter visas när de behövs.</p></details></section>
    <section><h2>Tider för kallelse</h2><ActivityTimingFields rules={timing} defaults={defaults} touched={new Set()} invitations starts={[activity.startsAt]} timeZone="Europe/Stockholm" onChange={(key, value) => setTiming(current => ({...current, [key]:value}))}/></section>
    <section><h2>Aktivitetsförval</h2><ActivityDefaultsFields initial={{}} resolved={defaults}/></section>
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
