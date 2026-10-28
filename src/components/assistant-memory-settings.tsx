"use client";

import { useEffect, useId, useState } from "react";
import { z } from "zod";
import type { ParticipationFetch } from "./activity-invitation-response";

const memorySchema = z.object({
  id: z.uuid(),
  content: z.string(),
  revision: z.number(),
  disciplineKey: z.string().nullable(),
});
export function AssistantMemorySettings({
  request,
  scope = "personal",
  organizationId,
  sectionId,
  teamId,
}: {
  request: ParticipationFetch;
  scope?: "personal" | "organization" | "section" | "team";
  organizationId?: string;
  sectionId?: string;
  teamId?: string;
}) {
  const [memories, setMemories] = useState<z.infer<typeof memorySchema>[]>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const label = useId();
  const query = new URLSearchParams({
    scope,
    ...(organizationId ? { organizationId } : {}),
    ...(sectionId ? { sectionId } : {}),
    ...(teamId ? { teamId } : {}),
  });
  const path = `/api/assistant/memories?${query}`;
  useEffect(() => {
    const controller = new AbortController();
    void request(path, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const next = z.array(memorySchema).parse(await response.json());
        if (!controller.signal.aborted) setMemories(next);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Minnena kunde inte hämtas. Kontrollera din behörighet.");
      });
    return () => controller.abort();
  }, [path, request]);
  async function save(memory: z.infer<typeof memorySchema>, remove = false) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await request(
        `/api/assistant/memories/${memory.id}${remove ? `?revision=${memory.revision}` : ""}`,
        {
          method: remove ? "DELETE" : "PUT",
          headers: { "Content-Type": "application/json" },
          ...(remove
            ? {}
            : {
                body: JSON.stringify({
                  content: memory.content,
                  revision: memory.revision,
                }),
              }),
        },
      );
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? "Minnet har ändrats. Ladda om och granska det igen."
            : "Minnet kunde inte ändras. Kontrollera din behörighet.",
        );
      setMemories((current) =>
        remove
          ? current?.filter((item) => item.id !== memory.id)
          : current?.map((item) =>
              item.id === memory.id
                ? { ...item, revision: item.revision + 1 }
                : item,
            ),
      );
      setNotice(remove ? "Minnet är borttaget." : "Minnet är sparat.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Minnet kunde inte ändras.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="form-section">
      <h2>
        {scope === "personal"
          ? "Personliga assistentminnen"
          : "Gemensamma assistentminnen"}
      </h2>
      <p>
        {scope === "personal"
          ? "Dina personliga minnen används i både webb och Telegram. De blir inte klubbregler."
          : "Gemensamma minnen gäller bara på den valda nivån och ger inga extra behörigheter."}
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {memories?.length === 0 ? (
        <p>
          Inga sparade minnen. Be assistenten föreslå ett minne och granska det
          före Spara minne.
        </p>
      ) : null}
      {memories?.map((memory) => (
        <form
          key={memory.id}
          onSubmit={(event) => {
            event.preventDefault();
            void save(memory);
          }}
        >
          <label htmlFor={`${label}-${memory.id}`}>
            Minnestext{memory.disciplineKey ? ` · ${memory.disciplineKey}` : ""}
          </label>
          <textarea
            id={`${label}-${memory.id}`}
            maxLength={2000}
            required
            value={memory.content}
            onChange={(event) =>
              setMemories((current) =>
                current?.map((item) =>
                  item.id === memory.id
                    ? { ...item, content: event.target.value }
                    : item,
                ),
              )
            }
          />
          <div className="component-example-actions">
            <button type="submit" className="primary" disabled={pending}>
              Spara ändring
            </button>
            <button
              type="button"
              className="secondary danger"
              disabled={pending}
              onClick={() => {
                if (window.confirm("Ta bort detta minne?"))
                  void save(memory, true);
              }}
            >
              Ta bort minne
            </button>
          </div>
        </form>
      ))}
    </section>
  );
}
