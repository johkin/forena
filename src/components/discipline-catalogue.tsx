"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import type { ParticipationFetch } from "./activity-invitation-response";
const categorySchema = z.object({ key: z.string(), name: z.string() });
const disciplineSchema = z.object({
  key: z.string(),
  name: z.string(),
  category: z.string(),
  codeOwned: z.boolean(),
  packageVersion: z.string().nullable(),
});
const schema = z.object({
  categories: z.array(categorySchema),
  disciplines: z.array(disciplineSchema),
});
export function DisciplineCatalogue({
  request,
  onChanged,
}: {
  request: ParticipationFetch;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<z.infer<typeof schema>>();
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    request("/api/discipline-catalogue", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const snapshot = schema.parse(await response.json());
        if (!controller.signal.aborted) {
          setData(snapshot);
          setError(undefined);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Disciplinkatalogen kunde inte hämtas.");
      });
    return () => controller.abort();
  }, [request, attempt]);
  async function change(
    kind: "disciplines" | "categories",
    form: FormData,
    remove = false,
  ) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const key = String(form.get("key"));
      const response = await request(
        `/api/discipline-catalogue/${kind}/${encodeURIComponent(key)}`,
        {
          method: remove ? "DELETE" : "PUT",
          ...(remove
            ? {}
            : {
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  key,
                  name: String(form.get("name")),
                  category: form.get("category"),
                }),
              }),
        },
      );
      if (!response.ok) throw new Error();
      setAttempt((n) => n + 1);
      setNotice("Katalogen har uppdaterats.");
      onChanged?.();
    } catch {
      setError(
        "Ändringen kunde inte sparas. Kodägda paket kan inte ändras och använda poster kan inte tas bort.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="application-card">
      <h1>Discipliner</h1>
      <p>
        Discipliner väljs på sektionen och gäller alla dess lag. Kategorin
        grupperar katalogen.
      </p>
      {error ? (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            Läs in igen
          </button>
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {!data && !error ? <p role="status">Hämtar discipliner…</p> : null}
      {data ? (
        <>
          <section className="form-section">
            <h2>Discipliner</h2>
            {data.disciplines.map((item) => (
              <form
                key={item.key}
                className="application-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void change("disciplines", new FormData(event.currentTarget));
                }}
              >
                <input type="hidden" name="key" value={item.key} />
                <label>
                  Namn
                  <input
                    name="name"
                    defaultValue={item.name}
                    required
                    maxLength={100}
                    disabled={busy || item.codeOwned}
                  />
                </label>
                <label>
                  Kategori
                  <select
                    name="category"
                    defaultValue={item.category}
                    disabled={busy || item.codeOwned}
                  >
                    {data.categories.map((category) => (
                      <option key={category.key} value={category.key}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                {item.codeOwned ? (
                  <p>
                    Kodägt paket · version {item.packageVersion}. Uppdateras
                    genom en ny appversion.
                  </p>
                ) : (
                  <>
                    <p>
                      Inget disciplinpaket installerat. Gemensamma
                      aktivitetsfunktioner kan användas.
                    </p>
                    <div className="discipline-actions">
                      <button className="primary" disabled={busy}>
                        Spara
                      </button>
                      <button
                        className="secondary"
                        type="button"
                        disabled={busy}
                        onClick={(event) => {
                          const form = event.currentTarget.form;
                          if (form && window.confirm(`Ta bort ${item.name}?`))
                            void change(
                              "disciplines",
                              new FormData(form),
                              true,
                            );
                        }}
                      >
                        Ta bort
                      </button>
                    </div>
                  </>
                )}
              </form>
            ))}
            <details>
              <summary>Lägg till disciplin</summary>
              <form
                className="application-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void change("disciplines", new FormData(event.currentTarget));
                }}
              >
                <label>
                  Nyckel
                  <input
                    name="key"
                    required
                    pattern="[a-z][a-z0-9_-]{0,63}"
                    maxLength={64}
                  />
                </label>
                <label>
                  Namn
                  <input name="name" required maxLength={100} />
                </label>
                <label>
                  Kategori
                  <select name="category" required>
                    {data.categories.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary" disabled={busy}>
                  Lägg till
                </button>
              </form>
            </details>
          </section>
          <section className="form-section">
            <h2>Kategorier</h2>
            {data.categories.map((item) => (
              <form
                key={item.key}
                className="application-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void change("categories", new FormData(event.currentTarget));
                }}
              >
                <input type="hidden" name="key" value={item.key} />
                <label>
                  Namn
                  <input
                    name="name"
                    defaultValue={item.name}
                    maxLength={100}
                    required
                  />
                </label>
                <div className="discipline-actions">
                  <button className="primary" disabled={busy}>
                    Spara
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={
                      busy ||
                      data.disciplines.some(
                        (discipline) => discipline.category === item.key,
                      )
                    }
                    onClick={(event) => {
                      const form = event.currentTarget.form;
                      if (
                        form &&
                        window.confirm(`Ta bort kategorin ${item.name}?`)
                      )
                        void change("categories", new FormData(form), true);
                    }}
                  >
                    Ta bort
                  </button>
                </div>
              </form>
            ))}
            <details>
              <summary>Lägg till kategori</summary>
              <form
                className="application-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void change("categories", new FormData(event.currentTarget));
                }}
              >
                <label>
                  Nyckel
                  <input
                    name="key"
                    required
                    pattern="[a-z][a-z0-9_-]{0,63}"
                    maxLength={64}
                  />
                </label>
                <label>
                  Namn
                  <input name="name" required maxLength={100} />
                </label>
                <button className="primary" disabled={busy}>
                  Lägg till
                </button>
              </form>
            </details>
          </section>
        </>
      ) : null}
    </section>
  );
}
