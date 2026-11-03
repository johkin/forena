import { useEffect, useState } from "react";
import { z } from "zod";
import { AppLink } from "./app-link";
import { RosterInvitationAcceptance } from "../../src/components/roster-registration";
import type { ParticipationFetch } from "../../src/components/activity-invitation-response";

export function RosterInvitationLanding() {
  const [code] = useState(() => new URLSearchParams(window.location.search).get("code"));
  const [state, setState] = useState<"idle" | "pending" | "ready" | "error">("idle");
  useEffect(() => { window.history.replaceState(window.history.state, "", "/join-team"); }, []);
  async function prepare() {
    if (state === "pending") return;
    setState("pending");
    try {
      const response = await fetch("/api/auth/roster-invitation", { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
        headers: { "Content-Type": "application/json", "X-Forena-Request": "1" }, body: JSON.stringify({ code }), signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error();
      setState("ready");
    } catch { setState("error"); }
  }
  return <section className="auth-card"><h1>Din laginbjudan</h1>
    <p>Verifiera din egen e-postadress och logga in. Därefter kan du acceptera inbjudan och koppla ditt konto till laget.</p>
    {state === "ready" ? <div className="auth-form"><AppLink className="primary" href="/login">Logga in</AppLink><AppLink href="/register">Skapa konto</AppLink></div>
      : <button type="button" className="primary" onClick={() => void prepare()} disabled={state === "pending" || !code}>{state === "pending" ? "Kontrollerar…" : "Fortsätt med inbjudan"}</button>}
    {state === "error" || !code ? <p className="auth-error" role="alert">Inbjudan kunde inte öppnas. Den kan ha ersatts eller gått ut. Be lagets administratör skicka en ny inbjudan.</p> : null}
  </section>;
}

const pendingSchema = z.object({ id: z.uuid(), personName: z.string(), teamName: z.string(), email: z.string() });
export function PendingRosterInvitation({ request, onAccepted }: { request: ParticipationFetch; onAccepted: (team: string) => void }) {
  const [invitation, setInvitation] = useState<z.infer<typeof pendingSchema>>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    void request("/api/me/roster-invitation", { signal: abort.signal }).then(async response => {
      if (response.status === 204) return;
      if (!response.ok) throw new Error();
      const value = pendingSchema.parse(await response.json());
      if (!abort.signal.aborted) setInvitation(value);
    }).catch(() => { if (!abort.signal.aborted) setError("Din inbjudan kan inte användas med detta konto eller har gått ut. Logga in med adressen som fick inbjudan, eller be om en ny."); });
    return () => abort.abort();
  }, [request]);
  async function act(accept: boolean) {
    if (pending) return;
    setPending(true); setError(undefined);
    try {
      const response = await request("/api/me/roster-invitation", { method: accept ? "POST" : "DELETE" });
      if (!response.ok) throw new Error();
      if (accept) onAccepted(z.object({ teamId: z.uuid() }).parse(await response.json()).teamId);
      setDismissed(true);
    } catch { setError("Inbjudan kunde inte hanteras. Kontrollera att du är inloggad med rätt adress. Försök igen eller be om en ny inbjudan."); }
    finally { setPending(false); }
  }
  if (dismissed) return null;
  if (!invitation) return error ? <section className="application-card"><p className="auth-error" role="alert">{error}</p><button type="button" className="secondary" disabled={pending} onClick={() => void act(false)}>Stäng inbjudan</button></section> : null;
  return <RosterInvitationAcceptance {...invitation} pending={pending} error={error} onAccept={() => void act(true)} onDismiss={() => void act(false)} />;
}
