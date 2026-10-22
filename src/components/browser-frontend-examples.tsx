"use client";
import type { NavigationLink } from "./navigation-link";
import { useCallback, useRef, useState } from "react";
import { PasswordLoginForm } from "./password-login-form";
import { ActivityInvitationResponse, type ParticipationFetch } from "./activity-invitation-response";
import { MyActivityList, type MyActivity } from "./my-activity-list";
import { SessionMenu } from "./session-menu";

/** Actual pilot components with local fixtures; no login or database mutations. */
export function BrowserFrontendExamples({ linkComponent }: { linkComponent?: NavigationLink }) {
  const [error, setError] = useState<string>();
  const invitations = useRef([{ id: "11111111-1111-4111-8111-111111111111", person_id: "22222222-2222-4222-8222-222222222222", name: "Alex Exempel", response: "pending", response_comment: null as string | null }]);
  const request = useCallback<ParticipationFetch>(async (path, init) => {
    if (init?.method === "PUT") {
      const change = JSON.parse(String(init.body)) as { response: string; comment?: string };
      invitations.current = invitations.current.map(item => item.id === path.split("/")[3]
        ? { ...item, response: change.response, ...(change.comment !== undefined ? { response_comment: change.comment } : {}) } : item);
      return Response.json({ ok: true });
    }
    return Response.json({ invitations: invitations.current });
  }, []);
  const activities: MyActivity[] = [{ id: "33333333-3333-4333-8333-333333333333", title: "Träning med laget", starts_at: "2030-10-22T16:00:00Z", ends_at: "2030-10-22T17:30:00Z", organization_name: "Exempelföreningen med ett långt namn", team_name: "Ungdomslaget", invitations: [
    { id: "11111111-1111-4111-8111-111111111111", person_id: "22222222-2222-4222-8222-222222222222", name: "Alex Exempel med ett långt familjenamn", response: "pending", response_comment: null },
    { id: "44444444-4444-4444-8444-444444444444", person_id: "55555555-5555-4555-8555-555555555555", name: "Robin Exempel", response: "declined", response_comment: "Bevaras vid snabbsvar" },
  ] }];
  return <>
    <section><h2>Mina aktiviteter</h2><MyActivityList linkComponent={linkComponent} request={request} activities={activities} loadMore={() => {}} /></section>
    <section><h2>Aktivitet utan utskickad kallelse</h2><MyActivityList linkComponent={linkComponent} activities={[{ ...activities[0], invitations: [] }]} /></section>
    <section><h2>Aktiviteter laddas</h2><MyActivityList linkComponent={linkComponent} activities={[]} loading /></section>
    <section><h2>Tom aktivitetsöversikt</h2><MyActivityList linkComponent={linkComponent} activities={[]} /></section>
    <section><h2>Aktivitetsfel</h2><MyActivityList linkComponent={linkComponent} activities={[]} error="Aktiviteterna kunde inte hämtas." retry={() => {}} /></section>
    <section><h2>Inloggning med lösenord eller passkey</h2><p>Lokalt exempel. Inga inloggningsuppgifter skickas.</p><PasswordLoginForm error={error} onLogin={() => setError("Exempel på ett inloggningsfel. Försök igen.")} onPasskey={() => setError("Exempel på avbruten passkey-inloggning. Försök igen.")} /></section>
    <section><h2>Inloggning pågår</h2><PasswordLoginForm pending onLogin={() => {}} onPasskey={() => {}} /></section>
    <section><h2>Kallelsesvar</h2><ActivityInvitationResponse activityId="33333333-3333-4333-8333-333333333333" cancelled={false} request={request} /></section>
    <section><h2>Inställd aktivitet</h2><ActivityInvitationResponse activityId="33333333-3333-4333-8333-333333333333" cancelled request={request} /></section>
    <section><h2>Kontomeny</h2><SessionMenu linkComponent={linkComponent} accountEmail="familj@example.invalid" logout={<button type="button" disabled>Logga ut</button>} /></section>
  </>;
}
