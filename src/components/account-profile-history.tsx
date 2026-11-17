"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import type { ParticipationFetch } from "./activity-invitation-response";

const schema = z.array(z.object({ id: z.uuid(), actor: z.string(), changedAt: z.string(), changes: z.string() }));

/** Shared, bounded history pages for guardians and club administrators. */
export function AccountProfileHistory({ path, request }: { path: string; request: ParticipationFetch }) {
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<z.infer<typeof schema>>();
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(true);
  useEffect(() => {
    const abort = new AbortController();
    void request(path + (offset ? `?offset=${offset}` : ""), { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const result = schema.parse(await response.json());
      if (!abort.signal.aborted) setPage(result);
    }).catch(() => { if (!abort.signal.aborted) setError(true); })
      .finally(() => { if (!abort.signal.aborted) setPending(false); });
    return () => abort.abort();
  }, [path, request, offset]);
  function move(next: number) { setPending(true); setError(false); setOffset(next); }
  return <section aria-label="Profilhistorik" aria-busy={pending}>
    {error ? <p role="alert">Historiken kunde inte hämtas. Din åtkomst kan ha upphört.</p> : null}
    {page?.length ? <ul>{page.map(item => <li key={item.id}>{item.actor} · {new Date(item.changedAt).toLocaleString("sv-SE")}<pre className="account-history">{item.changes}</pre></li>)}</ul> : pending ? <p>Laddar historik…</p> : <p>Inga sparade ändringar.</p>}
    {offset > 0 ? <button type="button" className="secondary" disabled={pending} onClick={() => move(Math.max(0, offset - 100))}>Nyare ändringar</button> : null}
    {page?.length === 100 ? <button type="button" className="secondary" disabled={pending} onClick={() => move(offset + 100)}>Äldre ändringar</button> : null}
  </section>;
}
