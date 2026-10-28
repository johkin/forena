"use client";

import { AssistantMemorySettings } from "./assistant-memory-settings";
import { useEffect, useId, useState } from "react";
import { z } from "zod";
import type { ParticipationFetch } from "./activity-invitation-response";

const profileSchema = z.object({
  name: z.string(),
  personality: z.string(),
  instructions: z.string(),
  revision: z.number(),
});
export function AssistantProfileEditor({
  request,
  organizationId,
  sectionId,
}: {
  request: ParticipationFetch;
  organizationId: string;
  sectionId?: string;
}) {
  const [profile, setProfile] = useState<z.infer<typeof profileSchema>>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const field = useId();
  const path = `/api/assistant/profiles/${organizationId}${sectionId ? `/sections/${sectionId}` : ""}`;
  useEffect(() => {
    const controller = new AbortController();
    void request(path, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const value: unknown = await response.json();
        const next = sectionId
          ? z
              .object({ instructions: z.string(), revision: z.number() })
              .transform((value) => ({ ...value, name: "", personality: "" }))
              .parse(value)
          : profileSchema.parse(value);
        if (!controller.signal.aborted) setProfile(next);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Assistentprofilen kunde inte hämtas.");
      });
    return () => controller.abort();
  }, [request, path, sectionId]);
  return (
    <section className="form-section">
      <h2>
        {sectionId
          ? "Sektionens assistentinstruktioner"
          : "Klubbens AI-assistent"}
      </h2>
      <p>
        Instruktionerna gäller från nästa svar. Behörighet, dataskydd och
        knappbekräftelser gäller alltid.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {!profile ? (
        <p role="status">Hämtar assistentprofil…</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (pending) return;
            setPending(true);
            setError("");
            setNotice("");
            void (async () => {
              try {
                const response = await request(path, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(
                    sectionId
                      ? {
                          instructions: profile.instructions,
                          revision: profile.revision,
                        }
                      : profile,
                  ),
                });
                if (!response.ok)
                  throw new Error(
                    response.status === 409
                      ? "Profilen har ändrats. Ladda om före nästa ändring."
                      : "Profilen kunde inte sparas. Kontrollera din behörighet.",
                  );
                setProfile((current) =>
                  current
                    ? { ...current, revision: current.revision + 1 }
                    : current,
                );
                setNotice("Assistentprofilen är sparad.");
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Profilen kunde inte sparas.",
                );
              } finally {
                setPending(false);
              }
            })();
          }}
        >
          {!sectionId ? (
            <>
              <label htmlFor={`${field}-name`}>Assistentens namn</label>
              <input
                id={`${field}-name`}
                maxLength={100}
                required
                value={profile.name}
                onChange={(event) =>
                  setProfile({ ...profile, name: event.target.value })
                }
              />
              <label htmlFor={`${field}-personality`}>
                Personlighet och bemötande
              </label>
              <textarea
                id={`${field}-personality`}
                maxLength={2000}
                value={profile.personality}
                onChange={(event) =>
                  setProfile({ ...profile, personality: event.target.value })
                }
              />
            </>
          ) : null}
          <label htmlFor={`${field}-instructions`}>
            Instruktioner och rutiner
          </label>
          <textarea
            id={`${field}-instructions`}
            maxLength={6000}
            rows={6}
            value={profile.instructions}
            onChange={(event) =>
              setProfile({ ...profile, instructions: event.target.value })
            }
          />
          <button type="submit" className="primary" disabled={pending}>
            {pending ? "Sparar…" : "Spara assistentprofil"}
          </button>
        </form>
      )}
      <AssistantMemorySettings
        request={request}
        scope={sectionId ? "section" : "organization"}
        organizationId={organizationId}
        sectionId={sectionId}
      />
    </section>
  );
}
