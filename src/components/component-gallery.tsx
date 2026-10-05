"use client";

import { useState } from "react";
import { FiveMinuteTimeField } from "@/components/five-minute-time-field";
import { ActivityEditorModal } from "@/components/activity-editor-modal";
import { ActivityDetailModal } from "@/components/activity-detail-modal";
import { ActivityStaffingList } from "@/components/activity-staffing-list";
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

export function ComponentGallery() {
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
    <section><h2>Bemanning</h2><ActivityStaffingList invitees={[...invitees]} /></section>
    <section><h2>Aktivitetsdialoger</h2><p>Den riktiga aktivitetsredigeraren körs i demoläge. Inga aktiviteter eller kallelser sparas.</p><div className="component-example-actions">
      <button className="secondary" onClick={() => setDialog("detail")}>Visa aktivitet</button>
      <button className="primary" onClick={() => setDialog("create")}>Ny aktivitet</button>
    </div></section>
    {dialog === "create" || dialog === "edit" ? <ActivityEditorModal mode={dialog} activity={dialog === "edit" ? activity : undefined} organization={organization} team={team} members={invitees.map(person => ({ id: person.personId, organizationId: organization.id, displayName: person.displayName, teamRelation: person.role === "leader" ? "leader" : "player" }))} source="demo" canManageInvitations={false} onClose={() => setDialog(undefined)} onNotice={setNotice} /> : null}
    {dialog === "detail" ? <ActivityDetailModal activity={activity} organization={organization} team={team} canManageActivity canManageInvitations={false} canManageAttendance={false} rosterMembers={[]} onClose={() => setDialog(undefined)} onEdit={() => setDialog("edit")} /> : null}
  </>;
}
