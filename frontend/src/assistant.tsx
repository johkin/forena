import { useEffect, useState } from "react";
import { z } from "zod";
import { PersistentAssistant } from "../../src/components/persistent-assistant";
import {
  TelegramSettingsView,
  type TelegramState,
} from "../../src/components/telegram-settings";
import type { ParticipationFetch } from "../../src/components/activity-invitation-response";

const overviewSchema = z.object({
  organizations: z.array(z.object({ id: z.uuid(), name: z.string() })),
  teams: z.array(z.object({ id: z.uuid(), organization_id: z.uuid() })),
  activities: z.array(
    z.object({
      id: z.uuid(),
      team: z.object({ id: z.uuid() }),
      organization: z.object({ id: z.uuid() }),
    }),
  ),
});
export function AssistantEntry({
  request,
  accountId,
  path,
  search,
}: {
  request: ParticipationFetch;
  accountId: string;
  path: string;
  search: string;
}) {
  const [context, setContext] = useState<z.infer<typeof overviewSchema>>();
  useEffect(() => {
    const controller = new AbortController();
    void request("/api/me/overview", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const next = overviewSchema.parse(await response.json());
        if (!controller.signal.aborted) setContext(next);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [request, accountId]);
  const match = /^\/(organizations|teams)\/([0-9a-f-]{36})(?:\/members)?$/.exec(
    path,
  );
  const activityId = /^\/activities\/([0-9a-f-]{36})$/.exec(path)?.[1];
  const activity = context?.activities.find((item) => item.id === activityId);
  const teamId =
    activity?.team.id ?? (match?.[1] === "teams" ? match[2] : undefined);
  const organizationId =
    match?.[1] === "organizations"
      ? match[2]
      : context?.teams.find((team) => team.id === teamId)?.organization_id;
  if (match && !organizationId) return null;
  const selected = z
    .uuid()
    .safeParse(new URLSearchParams(search).get("conversation"));
  return (
    <PersistentAssistant
      key={`${accountId}:${organizationId ?? "personal"}`}
      request={request}
      organizationId={organizationId}
      teamId={teamId}
      activityId={activityId}
      name={
        organizationId
          ? context?.organizations.find((org) => org.id === organizationId)
              ?.name
          : "Förena"
      }
      initialConversationId={selected.success ? selected.data : undefined}
    />
  );
}

const telegramSchema = z.object({
  active: z.boolean(),
  available: z.boolean(),
  pairingUrl: z.string().startsWith("https://t.me/").nullable().optional(),
  pairingExpiresAt: z.number().nullable().optional(),
});
export function TelegramProfileSettings({
  request,
}: {
  request: ParticipationFetch;
}) {
  const [state, setState] = useState<TelegramState | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function update(operation?: "start" | "disable", signal?: AbortSignal) {
    if (operation) setPending(true);
    try {
      const response = await request(
        "/api/telegram/settings",
        operation
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                operation,
                consent: operation === "start",
              }),
              signal,
            }
          : { signal },
      );
      if (!response.ok)
        throw new Error(
          "Telegram-inställningen kunde inte hämtas eller sparas.",
        );
      const next = telegramSchema.parse(await response.json());
      if (signal?.aborted) return;
      setState((current) => ({
        ...next,
        pairingUrl:
          next.pairingUrl ??
          (!operation && !next.active ? current?.pairingUrl : undefined),
        pairingExpiresAt:
          next.pairingExpiresAt ??
          (!operation && !next.active ? current?.pairingExpiresAt : undefined),
      }));
      setError("");
      if (operation === "start" && next.pairingUrl)
        window.location.assign(next.pairingUrl);
    } catch {
      if (!signal?.aborted)
        setError(
          "Telegram-inställningen kunde inte hämtas eller sparas. Försök igen.",
        );
    } finally {
      if (!signal?.aborted) setPending(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => void update(undefined, controller.signal),
      0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!state?.pairingUrl || state.active) return;
    const controller = new AbortController();
    let busy = false;
    const timer = window.setInterval(() => {
      if (state.pairingExpiresAt && Date.now() >= state.pairingExpiresAt) {
        setState((current) =>
          current
            ? { ...current, pairingUrl: undefined, pairingExpiresAt: undefined }
            : current,
        );
        setError("Kopplingslänken har gått ut. Aktivera Telegram igen.");
        return;
      }
      if (document.visibilityState === "hidden" || busy) return;
      busy = true;
      void update(undefined, controller.signal).finally(() => {
        busy = false;
      });
    }, 3000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [request, state?.pairingUrl, state?.active, state?.pairingExpiresAt]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <TelegramSettingsView
      state={state}
      pending={pending}
      error={error}
      assistantEnabled
      onStart={() => void update("start")}
      onDisable={() => void update("disable")}
      onRefresh={() => void update()}
    />
  );
}
