"use client";

import { AssistantProfileEditor } from "./assistant-profile-editor";
import { AssistantMemorySettings } from "./assistant-memory-settings";
import { TelegramGroups } from "./telegram-groups";
import { PushNotificationSettings } from "./push-notification-settings";
import { useMemo } from "react";
import { AssistantWorkspace } from "./persistent-assistant";
import type { ParticipationFetch } from "./activity-invitation-response";

/** Synthetic transport runs the production view without model calls or business writes. */
export function AssistantExamples() {
  const request = useMemo<ParticipationFetch>(() => {
    const id = "00000000-0000-4000-8000-000000000101";
    const conversation = {
      id,
      organizationId: null,
      channel: "web",
      active: true,
      updatedAt: "2026-10-27T12:00:00Z",
    };
    return async (path, init) => {
      if (path.endsWith("/messages"))
        return new Response(
          JSON.stringify({
            sender: "Förena",
            organizationId: null,
            text: "Det här är ett lokalt exempel. Inga uppgifter har ändrats.",
            proposals: [],
            failed: false,
          }) + "\n",
          { headers: { "Content-Type": "application/x-ndjson" } },
        );
      if (path.endsWith("/conversations") && init?.method === "POST")
        return Response.json(conversation);
      if (path.endsWith("/conversations")) return Response.json([conversation]);
      if (init?.method === "DELETE") return Response.json({ ok: true });
      return Response.json({
        conversation,
        messages: [
          {
            id: "00000000-0000-4000-8000-000000000102",
            role: "assistant",
            sender: "UIK:s assistent",
            organizationId: "00000000-0000-4000-8000-000000000103",
            content:
              "Träningen börjar klockan 17.00. Samling 16.45 vid klubbstugan.",
          },
        ],
        proposals: [],
      });
    };
  }, []);
  return (
    <section id="assistant-conversation-example">
      <h2>Personlig assistent och sparade samtal</h2>
      <p>
        Syntetiskt exempel med samma samtalsvy som appen. Inga externa anrop
        eller verksamhetsändringar görs.
      </p>
      <AssistantWorkspace request={request} />
    </section>
  );
}

export function AssistantSettingsExamples() {
  const request = useMemo<ParticipationFetch>(() => async (path) => {
    if (path.includes("/memories")) return Response.json([{ id: "00000000-0000-4000-8000-000000000201", content: "Jag föredrar korta, tydliga svar.", revision: 1, disciplineKey: null }]);
    if (path.includes("/profiles/")) return Response.json({ name: "Klubbassistenten", personality: "Vänlig och saklig", instructions: "Förklara hur caféet bokas.", revision: 0 });
    if (path.includes("/telegram/groups")) return Response.json({ canManage: true, links: [] });
    if (path.includes("/push-subscriptions")) return Response.json({ available: false, publicKey: "" });
    return Response.json({ ok: true });
  }, []);
  return <section id="assistant-settings-examples"><h2>Assistentens inställningar</h2><p>Syntetiska exempel. Ändringar sparas inte och inga externa notifieringar skickas.</p>
    <AssistantProfileEditor request={request} organizationId="00000000-0000-4000-8000-000000000202" />
    <AssistantMemorySettings request={request} />
    <TelegramGroups request={request} teamId="00000000-0000-4000-8000-000000000203" />
    <PushNotificationSettings request={request} />
  </section>;
}
