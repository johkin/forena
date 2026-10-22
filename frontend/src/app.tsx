import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { AppLink } from "./app-link";
import { z } from "zod";
import { MyActivitiesPage } from "./my-activities";
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
  const menu = <SessionMenu linkComponent={AppLink} accountEmail={email} logout={logout} />;
  return <><div className="app-page"><AppShellFrame sidebar={menu}
    header={<AppHeaderFrame linkComponent={AppLink} sidebarNavigation actions={!email ? <AppLink className="secondary" href="/login">Logga in</AppLink> : null}>{menu}</AppHeaderFrame>}>
    {children}
  </AppShellFrame></div><AppFooter showConnect={false} /></>;
}

export function ConfigurationError() {
  return <Frame><main tabIndex={-1} className="content"><h1>Förena är inte redo ännu</h1><p>Webbplatsen kunde inte startas. Försök igen senare.</p></main></Frame>;
}

export function App({ config }: { config: PublicConfig }) {
  const location = useLocation();
  const navigate = useNavigate();
  const publicGallery = location.pathname === "/components";
  useEffect(() => {
    document.querySelector<HTMLElement>("main")?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.key]);
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
    const initial = publicGallery ? undefined : window.setTimeout(() => { void reloadSession(); }, 0);
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("forena-session");
    channelRef.current = channel;
    if (channel) channel.onmessage = () => { applySession(null); if (!publicGallery) void reloadSession(); };
    const focus = () => { if (!publicGallery) void reloadSession(); };
    window.addEventListener("focus", focus);
    return () => { clearTimeout(initial); invalidateSessionChecks(); channel?.close(); channelRef.current = null; window.removeEventListener("focus", focus); };
  }, [reloadSession, applySession, invalidateSessionChecks, publicGallery]);
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
  const path = location.pathname;
  if (path === "/components") return <Frame><main tabIndex={-1} className="content component-gallery"><h1>Komponenter</h1><BrowserFrontendExamples linkComponent={AppLink} /></main></Frame>;
  if (!auth.ready) return <Frame><main tabIndex={-1} className="content"><p role="status">Laddar Förena…</p></main></Frame>;

  async function login(email?: string, password?: string) {
    setPending(true); setError(undefined);
    try {
      const session = email === undefined ? await passkeyLogin() : parseSession(await authRequest("login", { email, password }));
      if (!session) { setError("Inloggningen misslyckades. Försök igen."); return; }
      applySession(session); notifySessionChanged();
      if (path === "/login") {
        navigate(safeDestination(new URLSearchParams(location.search).get("next")), { replace: true });
      }
    } catch { setError("Inloggningen kunde inte genomföras. Försök igen."); }
    finally { setPending(false); }
  }
  if (!auth.session) return <Frame key="guest"><main tabIndex={-1} className="auth-page"><section className="auth-card">
    <span className="brand-mark">F</span><p className="eyebrow">Förena</p><h1>Logga in</h1>
    <p>Logga in för att se dina aktiviteter och svara på kallelser.</p>
    <PasswordLoginForm onLogin={(email, password) => void login(email, password)} onPasskey={() => void login()} pending={pending} error={error} />
  </section></main></Frame>;

  const match = /^\/activities\/([^/]+)$/.exec(path);
  const activityId = match?.[1] ?? (path === "/migration/participation" ? config.activityId : undefined);
  const validActivity = z.uuid().safeParse(activityId);
  const knownPath = path === "/" || path === "/login" || path === "/migration/participation" || Boolean(match);
  async function logout() {
    setPending(true); setError(undefined);
    try {
      await authRequest("logout", {});
      applySession(null); notifySessionChanged();
      navigate("/login", { replace: true });
    } catch { setError("Utloggningen misslyckades. Försök igen."); }
    finally { setPending(false); }
  }
  return <Frame key={auth.session.user.id} email={auth.session.user.email ?? undefined} logout={<button type="button" className="logout-button" aria-label="Logga ut från Förena" disabled={pending} onClick={() => void logout()}>{pending ? "Loggar ut…" : "Logga ut"}</button>}>
    <main tabIndex={-1} className="content" key={auth.session.user.id}>
      <p className="eyebrow">Personligt</p><h1>{!knownPath ? "Sidan finns inte" : path === "/" || path === "/login" ? "Mina aktiviteter" : "Kallelser"}</h1>
      {error ? <p role="alert">{error}</p> : null}
      {!knownPath ? <AppLink href="/">Till startsidan</AppLink> : path === "/" || path === "/login" ? <MyActivitiesPage request={request} /> : validActivity.success ? <>
        <p><AppLink href="/">Till mina aktiviteter</AppLink></p>
        <p>Svara för var och en och lägg till en kommentar om det behövs.</p>
        <ActivityInvitationResponse activityId={validActivity.data} cancelled={false} request={request} />
      </> : <p>Inga kallelser att visa här ännu. Öppna länken till en aktivitet för att se dina kallelser.</p>}
    </main>
  </Frame>;
}
