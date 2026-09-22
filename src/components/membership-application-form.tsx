"use client";

import { useMemo, useState } from "react";
import { submitMembershipApplication } from "@/app/o/[organizationSlug]/join/actions";

export type JoinOption = {
  organizationId: string;
  sectionId: string;
  sectionName: string;
  sectionSlug: string;
  teamId: string;
  teamName: string;
  teamSlug: string;
};

export function MembershipApplicationForm({ organizationSlug, options, selectedSection, selectedTeam }: {
  organizationSlug: string;
  options: JoinOption[];
  selectedSection?: string;
  selectedTeam?: string;
}) {
  const sections = useMemo(() => [...new Map(options.map((item) => [item.sectionId, item])).values()], [options]);
  const initialSection = options.find((item) => item.sectionSlug === selectedSection || item.teamSlug === selectedTeam)?.sectionId ?? sections[0]?.sectionId ?? "";
  const [sectionId, setSectionId] = useState(initialSection);
  const teams = options.filter((item) => item.sectionId === sectionId);
  const initialTeam = teams.find((item) => item.teamSlug === selectedTeam)?.teamId ?? teams[0]?.teamId ?? "";

  return (
    <form action={submitMembershipApplication} className="application-form">
      <input name="organizationSlug" type="hidden" value={organizationSlug} />
      <input name="organizationId" type="hidden" value={options[0]?.organizationId} />

      <section className="form-section">
        <h2>Vad gäller ansökan?</h2>
        {sections.length > 1 ? <label>Sektion<select name="sectionId" value={sectionId} onChange={(event) => setSectionId(event.target.value)}>{sections.map((section) => <option key={section.sectionId} value={section.sectionId}>{section.sectionName}</option>)}</select></label> : <input name="sectionId" type="hidden" value={sectionId} />}
        <label>Lag eller verksamhet<select key={sectionId} name="teamId" defaultValue={initialTeam}>{teams.map((team) => <option key={team.teamId} value={team.teamId}>{team.teamName}</option>)}</select></label>
      </section>

      <section className="form-section">
        <h2>Spelaren</h2>
        <div className="form-row"><label>Förnamn<input name="playerFirstName" required maxLength={80} /></label><label>Efternamn<input name="playerLastName" required maxLength={80} /></label></div>
        <label>Födelsedatum<input name="playerBirthDate" type="date" required /></label>
        <label>Adress<input name="address" maxLength={200} /></label>
        <div className="form-row"><label>Postnummer<input name="postalCode" maxLength={20} /></label><label>Ort<input name="city" maxLength={100} /></label></div>
        <label>Tidigare eller nuvarande förening<input name="previousClub" maxLength={160} /></label>
        <label>Allergier eller viktig information<textarea name="allergies" maxLength={1000} rows={3} /></label>
        <label>Meddelande till kansliet<textarea name="message" maxLength={2000} rows={4} /></label>
        <label>Får föreningen publicera foton där spelaren medverkar?<select name="photoConsent" defaultValue=""><option value="">Välj</option><option value="yes">Ja</option><option value="no">Nej</option></select></label>
      </section>

      <section className="form-section">
        <h2>Målsman 1</h2>
        <div className="form-row"><label>Förnamn<input name="guardian1FirstName" required maxLength={80} /></label><label>Efternamn<input name="guardian1LastName" required maxLength={80} /></label></div>
        <label>E-post<input name="guardian1Email" type="email" required autoComplete="email" /></label>
        <label>Mobil<input name="guardian1Mobile" type="tel" maxLength={40} /></label>
      </section>

      <section className="form-section">
        <h2>Målsman 2 <small>valfritt</small></h2>
        <div className="form-row"><label>Förnamn<input name="guardian2FirstName" maxLength={80} /></label><label>Efternamn<input name="guardian2LastName" maxLength={80} /></label></div>
        <label>E-post<input name="guardian2Email" type="email" /></label>
        <label>Mobil<input name="guardian2Mobile" type="tel" maxLength={40} /></label>
      </section>

      <p className="form-help">Uppgifterna granskas av föreningens kansli. Inget konto eller medlemskap skapas innan ansökan har godkänts.</p>
      <button className="primary application-submit" type="submit">Skicka ansökan</button>
    </form>
  );
}
