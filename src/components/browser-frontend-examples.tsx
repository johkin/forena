"use client";
import { useCallback, useRef, useState } from "react";
import { PasswordLoginForm } from "./password-login-form";
import { ActivityInvitationResponse, type ParticipationFetch } from "./activity-invitation-response";
import { SessionMenu } from "./session-menu";

/** Actual pilot components with local fixtures; no login or database mutations. */
export function BrowserFrontendExamples() {
  const [error, setError] = useState<string>();
  const invitations = useRef([{ id: "11111111-1111-4111-8111-111111111111", person_id: "22222222-2222-4222-8222-222222222222", name: "Alex Exempel", response: "pending", response_comment: null as string | null }]);
  const request = useCallback<ParticipationFetch>(async (_path, init) => {
    if (init?.method === "PUT") {
      const change = JSON.parse(String(init.body)) as { response: string; comment: string };
      invitations.current = invitations.current.map(item => ({ ...item, response: change.response, response_comment: change.comment }));
      return Response.json({ ok: true });
    }
    return Response.json({ invitations: invitations.current });
  }, []);
  return <>
    <section><h2>Inloggning med lösenord</h2><p>Lokalt exempel. Inga inloggningsuppgifter skickas.</p><PasswordLoginForm error={error} onLogin={() => setError("Exempel på ett inloggningsfel. Försök igen.")} /></section>
    <section><h2>Inloggning pågår</h2><PasswordLoginForm pending onLogin={() => {}} /></section>
    <section><h2>Familjens kallelsesvar</h2><ActivityInvitationResponse activityId="33333333-3333-4333-8333-333333333333" cancelled={false} request={request} /></section>
    <section><h2>Inställd aktivitet</h2><ActivityInvitationResponse activityId="33333333-3333-4333-8333-333333333333" cancelled request={request} /></section>
    <section><h2>Kontomeny</h2><SessionMenu accountEmail="familj@example.invalid" logout={<button type="button" disabled>Logga ut</button>} /></section>
  </>;
}
