import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AppHeaderFrame } from "../../src/components/app-header-frame";
import { AppShellFrame } from "../../src/components/app-shell-frame";
import { AppFooter } from "../../src/components/app-footer";
import { SessionMenu } from "../../src/components/session-menu";
import { PasswordLoginForm } from "../../src/components/password-login-form";
import { ActivityInvitationResponse, type ParticipationFetch } from "../../src/components/activity-invitation-response";
import { BrowserFrontendExamples } from "../../src/components/browser-frontend-examples";
import { createApiFetch, safeDestination } from "./api";
import type { PublicConfig } from "./config";

function Frame({ children, email, logout }: { children: ReactNode; email?: string; logout?: ReactNode }) {
  const menu = <SessionMenu accountEmail={email} logout={logout} />;
  return <><div className="app-page"><AppShellFrame sidebar={menu}
    header={<AppHeaderFrame sidebarNavigation actions={!email ? <a className="secondary" href="/login">Logga in</a> : null}>{menu}</AppHeaderFrame>}>
    {children}
  </AppShellFrame></div><AppFooter showConnect={false} /></>;
}

export function ConfigurationError() {
  return <Frame><main className="content"><h1>Förena är inte redo ännu</h1><p>Webbplatsen kunde inte startas. Försök igen senare.</p></main></Frame>;
}

export function App({ config, client }: { config: PublicConfig; client: SupabaseClient }) {
  const [auth, setAuth] = useState<{ ready: boolean; session: Session | null }>({ ready: false, session: null });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const activeAccount = useRef<string | undefined>(undefined);
  const accountId = auth.session?.user.id;
  useEffect(() => {
    let active = true;
    let notified = false;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      notified = true;
      if (active) { activeAccount.current = session?.user.id; setAuth({ ready: true, session }); }
    });
    void client.auth.getSession().then(({ data, error }) => {
      if (active && !notified) {
        activeAccount.current = error ? undefined : data.session?.user.id;
        setAuth({ ready: true, session: error ? null : data.session });
      }
    }).catch(() => { if (active && !notified) setAuth({ ready: true, session: null }); });
    return () => { active = false; subscription.unsubscribe(); };
  }, [client]);
  const request = useCallback<ParticipationFetch>((path, init) => createApiFetch(async () => {
    if (activeAccount.current !== accountId) throw new DOMException("Session changed", "AbortError");
    const { data, error } = await client.auth.getSession();
    if (activeAccount.current !== accountId || (data.session && data.session.user.id !== accountId)) throw new DOMException("Session changed", "AbortError");
    return error ? null : data.session?.access_token ?? null;
  }, () => {
    if (activeAccount.current !== accountId) return;
    activeAccount.current = undefined;
    setAuth({ ready: true, session: null });
    setError("Logga in igen för att fortsätta.");
    void client.auth.signOut({ scope: "local" }).catch(() => {});
  })(path, init), [client, accountId]);
  const path = window.location.pathname;
  if (path === "/components") return <Frame><main className="content component-gallery"><h1>Komponenter</h1><BrowserFrontendExamples /></main></Frame>;
  if (!auth.ready) return <Frame><main className="content"><p role="status">Laddar Förena…</p></main></Frame>;

  async function login(email: string, password: string) {
    setPending(true); setError(undefined);
    try {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) { setError("Inloggningen misslyckades. Kontrollera e-postadress och lösenord."); return; }
      if (path === "/login") window.location.replace(safeDestination(new URLSearchParams(window.location.search).get("next")));
    } catch { setError("Inloggningen kunde inte genomföras. Försök igen."); }
    finally { setPending(false); }
  }
  if (!auth.session) return <Frame><main className="auth-page"><section className="auth-card">
    <span className="brand-mark">F</span><p className="eyebrow">Förena</p><h1>Logga in</h1>
    <p>Logga in för att se och svara på familjens kallelser.</p>
    <PasswordLoginForm onLogin={(email, password) => void login(email, password)} pending={pending} error={error} />
  </section></main></Frame>;

  const match = /^\/activities\/([^/]+)$/.exec(path);
  const activityId = match?.[1] ?? config.activityId;
  const validActivity = z.uuid().safeParse(activityId);
  const knownPath = path === "/" || path === "/login" || path === "/migration/participation" || Boolean(match);
  async function logout() {
    setPending(true); setError(undefined);
    try {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) { setError("Utloggningen misslyckades. Försök igen."); return; }
      window.location.replace("/login");
    } catch { setError("Utloggningen misslyckades. Försök igen."); }
    finally { setPending(false); }
  }
  return <Frame email={auth.session.user.email} logout={<button type="button" className="logout-button" aria-label="Logga ut från Förena" disabled={pending} onClick={() => void logout()}>{pending ? "Loggar ut…" : "Logga ut"}</button>}>
    <main className="content" key={auth.session.user.id}>
      <p className="eyebrow">Familjen</p><h1>{knownPath ? "Familjens kallelser" : "Sidan finns inte"}</h1>
      {error ? <p role="alert">{error}</p> : null}
      {!knownPath ? <a href="/">Till startsidan</a> : validActivity.success ? <>
        <p>Svara för var och en och lägg till en kommentar om det behövs.</p>
        <ActivityInvitationResponse activityId={validActivity.data} cancelled={false} request={request} />
      </> : <p>Inga kallelser att visa här ännu. Öppna länken till en aktivitet för att se familjens kallelser.</p>}
    </main>
  </Frame>;
}
