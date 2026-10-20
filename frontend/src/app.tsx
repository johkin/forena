import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { authRequest, parseSession, passkeyLogin, type SessionView } from "./session";

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

export function App({ config }: { config: PublicConfig }) {
  const [auth, setAuth] = useState<{ ready: boolean; session: SessionView | null }>({ ready: false, session: null });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const activeAccount = useRef<string | undefined>(undefined);
  const sessionRevision = useRef(0);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const accountId = auth.session?.user.id;
  const applySession = useCallback((session: SessionView | null) => {
    sessionRevision.current++;
    activeAccount.current = session?.user.id;
    setAuth({ ready: true, session });
  }, []);
  const reloadSession = useCallback(async () => {
    const revision = sessionRevision.current;
    try {
      const session = parseSession(await authRequest("session"));
      if (revision === sessionRevision.current) applySession(session);
    }
    catch {
      if (revision === sessionRevision.current) {
        setError("Sessionen kan inte verifieras just nu. Försök igen.");
        setAuth(previous => ({ ...previous, ready: true }));
      }
    }
  }, [applySession]);
  const invalidateSessionChecks = useCallback(() => { sessionRevision.current++; }, []);
  useEffect(() => {
    if (window.location.pathname === "/components") return;
    const initial = window.setTimeout(() => { void reloadSession(); }, 0);
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("forena-session");
    channelRef.current = channel;
    if (channel) channel.onmessage = () => { applySession(null); void reloadSession(); };
    const focus = () => { void reloadSession(); };
    window.addEventListener("focus", focus);
    return () => { clearTimeout(initial); invalidateSessionChecks(); channel?.close(); channelRef.current = null; window.removeEventListener("focus", focus); };
  }, [reloadSession, applySession, invalidateSessionChecks]);
  function notifySessionChanged() {
    channelRef.current?.postMessage("changed");
  }
  const request = useCallback<ParticipationFetch>((path, init) => createApiFetch(async () => {
    if (activeAccount.current !== accountId) throw new DOMException("Session changed", "AbortError");
    return accountId ?? null;
  }, () => {
    if (activeAccount.current !== accountId) return;
    applySession(null);
    setError("Logga in igen för att fortsätta.");
  })(path, init), [accountId, applySession]);
  const path = window.location.pathname;
  if (path === "/components") return <Frame><main className="content component-gallery"><h1>Komponenter</h1><BrowserFrontendExamples /></main></Frame>;
  if (!auth.ready) return <Frame><main className="content"><p role="status">Laddar Förena…</p></main></Frame>;

  async function login(email?: string, password?: string) {
    setPending(true); setError(undefined);
    try {
      const session = email === undefined ? await passkeyLogin() : parseSession(await authRequest("login", { email, password }));
      if (!session) { setError("Inloggningen misslyckades. Försök igen."); return; }
      applySession(session); notifySessionChanged();
      if (path === "/login") {
        window.history.replaceState(null, "", safeDestination(new URLSearchParams(window.location.search).get("next")));
      }
    } catch { setError("Inloggningen kunde inte genomföras. Försök igen."); }
    finally { setPending(false); }
  }
  if (!auth.session) return <Frame key="guest"><main className="auth-page"><section className="auth-card">
    <span className="brand-mark">F</span><p className="eyebrow">Förena</p><h1>Logga in</h1>
    <p>Logga in för att se och svara på familjens kallelser.</p>
    <PasswordLoginForm onLogin={(email, password) => void login(email, password)} onPasskey={() => void login()} pending={pending} error={error} />
  </section></main></Frame>;

  const match = /^\/activities\/([^/]+)$/.exec(path);
  const activityId = match?.[1] ?? config.activityId;
  const validActivity = z.uuid().safeParse(activityId);
  const knownPath = path === "/" || path === "/login" || path === "/migration/participation" || Boolean(match);
  async function logout() {
    setPending(true); setError(undefined);
    try {
      await authRequest("logout", {});
      applySession(null); notifySessionChanged();
      window.history.replaceState(null, "", "/login");
    } catch { setError("Utloggningen misslyckades. Försök igen."); }
    finally { setPending(false); }
  }
  return <Frame key={auth.session.user.id} email={auth.session.user.email ?? undefined} logout={<button type="button" className="logout-button" aria-label="Logga ut från Förena" disabled={pending} onClick={() => void logout()}>{pending ? "Loggar ut…" : "Logga ut"}</button>}>
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
