"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import type { ParticipationFetch } from "./activity-invitation-response";

const groupSchema = z.object({
  canManage: z.boolean(),
  links: z.array(
    z.object({
      kind: z.enum(["team", "leaders"]),
      url: z.string().startsWith("https://t.me/"),
    }),
  ),
});
export function TelegramGroups({
  request,
  teamId,
}: {
  request: ParticipationFetch;
  teamId: string;
}) {
  const [data, setData] = useState<z.infer<typeof groupSchema>>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const path = `/api/teams/${teamId}/telegram/groups`;
  useEffect(() => {
    const controller = new AbortController();
    void request(path, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const next = groupSchema.parse(await response.json());
        if (!controller.signal.aborted) setData(next);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Telegram-chattarna kunde inte hämtas.");
      });
    return () => controller.abort();
  }, [request, path]);
  async function change(kind: "team" | "leaders", remove: boolean) {
    setPending(true);
    setError("");
    try {
      const response = await request(remove ? `${path}/${kind}` : path, {
        method: remove ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        ...(remove ? {} : { body: JSON.stringify({ kind }) }),
      });
      if (!response.ok) throw new Error();
      if (remove)
        setData((current) =>
          current
            ? {
                ...current,
                links: current.links.filter((link) => link.kind !== kind),
              }
            : current,
        );
      else {
        const next = z
          .object({ pairingUrl: z.string().startsWith("https://t.me/") })
          .parse(await response.json());
        window.location.assign(next.pairingUrl);
      }
    } catch {
      setError(
        "Gruppen kunde inte kopplas eller kopplas bort. Kontrollera att ditt Telegram-konto är kopplat och att du får administrera laget.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="form-section">
      <h2>Telegram-chattar</h2>
      {error ? <p role="alert">{error}</p> : null}
      {data?.links.map((link) => (
        <p key={link.kind}>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            Öppna {link.kind === "team" ? "lagchatten" : "ledarchatten"}
          </a>
          {data.canManage ? (
            <button
              type="button"
              className="secondary"
              disabled={pending}
              onClick={() => void change(link.kind, true)}
            >
              Koppla bort
            </button>
          ) : null}
        </p>
      ))}
      {data?.canManage ? (
        <>
          <p>
            Skapa gruppen i Telegram eller välj en befintlig grupp. Du behöver
            vara administratör där och lägga till boten som administratör. Nya
            deltagare måste godkännas av en gruppadministratör.
          </p>
          <div className="component-example-actions">
            {(["team", "leaders"] as const)
              .filter((kind) => !data.links.some((link) => link.kind === kind))
              .map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className="secondary"
                  disabled={pending}
                  onClick={() => void change(kind, false)}
                >
                  Koppla {kind === "team" ? "lagchatt" : "ledarchatt"}
                </button>
              ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
