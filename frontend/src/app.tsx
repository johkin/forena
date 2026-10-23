import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { AppLink } from "./app-link";
import { z } from "zod";
import { Administration } from "../../src/components/administration";
import { ActivityManagement } from "../../src/components/activity-management";
import { ActivityDetails } from "./activity-details";
import { MyActivitiesPage } from "./my-activities";
import { AppHeaderFrame } from "../../src/components/app-header-frame";
import { AppShellFrame } from "../../src/components/app-shell-frame";
import { AppFooter } from "../../src/components/app-footer";
import { SessionMenu } from "../../src/components/session-menu";
import { PasswordLoginForm } from "../../src/components/password-login-form";
import { type ParticipationFetch } from "../../src/components/activity-invitation-response";
import { BrowserFrontendExamples } from "../../src/components/browser-frontend-examples";
import { createApiFetch, oauthDestination, safeDestination } from "./api";
import type { PublicConfig } from "./config";
import { authRequest, parseSession, passkeyLogin, registerPasskey, type SessionView } from "./session";

import { MagicLinkForm, MagicLinkConfirmation } from "../../src/components/magic-link-form";
import { AccountPage, ConsentPage, PasskeyList } from "./account";
import { PasskeyRegistration } from "../../src/components/passkey-registration";

function Frame({ children, email, logout }: { children: ReactNode; email?: string; logout?: ReactNode }) {
  const menu = <SessionMenu homeLabel="Min översikt" linkComponent={AppLink} accountEmail={email} securityHref="/account/security" logout={logout} />;
  return <><div className="app-page"><AppShellFrame sidebar={menu}
    header={<AppHeaderFrame linkComponent={AppLink} sidebarNavigation actions={!email ? <AppLink className="secondary" href="/login">Logga in</AppLink> : <AppLink className="notification-trigger" href="/notifications" aria-label="Visa kallelser som behöver svar"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg></AppLink>}>{menu}</AppHeaderFrame>}>
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
  const accountCallback = ["/auth/verify", "/auth/reset"].includes(location.pathname);
  const callback = location.pathname === "/auth/callback" || accountCallback;
  const [callbackCode] = useState(() => new URLSearchParams(window.location.search).get("code"));
  const [magicSent, setMagicSent] = useState(false);
  const [passkeyCreatedFor, setPasskeyCreatedFor] = useState<string>();
  useEffect(() => {
    if (callback) window.history.replaceState(window.history.state, "", location.pathname);
  }, [callback, location.pathname]);
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
    const initial = (publicGallery || callback) ? undefined : window.setTimeout(() => { void reloadSession(); }, 0);
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("forena-session");
    channelRef.current = channel;
    if (channel) channel.onmessage = () => { applySession(null); if (!publicGallery && !callback) void reloadSession(); };
    const focus = () => { if (!publicGallery && !callback) void reloadSession(); };
    window.addEventListener("focus", focus);
    return () => { clearTimeout(initial); invalidateSessionChecks(); channel?.close(); channelRef.current = null; window.removeEventListener("focus", focus); };
  }, [reloadSession, applySession, invalidateSessionChecks, publicGallery, callback]);
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
  if ((accountCallback || ["/register", "/password/forgot"].includes(path))) return <Frame><main tabIndex={-1} className="auth-page"><AccountPage key={path} action={path === "/register" ? "register" : path === "/password/forgot" ? "forgot" : path === "/auth/reset" ? "reset" : "verify"} code={callbackCode} /></main></Frame>;
  if (callback) return <Frame><main tabIndex={-1} className="auth-page"><MagicLinkConfirmation pending={pending} error={error} onConfirm={() => void (async () => {
    if (pending) return;
    if (!callbackCode) { setError("Länken är ogiltig eller har gått ut. Begär en ny länk från inloggningssidan."); return; }
    setPending(true); setError(undefined); invalidateSessionChecks();
    try {
      const session = parseSession(await authRequest("magic-link/verify", { code: callbackCode }));
      if (!session) throw new Error("Inactive session");
      applySession(session); notifySessionChanged();
      const destination = z.object({ destination: z.string() }).parse(await authRequest("continue")).destination;
      const oauth = oauthDestination(destination);
      if (oauth) window.location.assign(oauth);
      else navigate("/", { replace: true });
    } catch { setError("Länken kunde inte användas. Öppna den i samma webbläsare som begärde länken, eller begär en ny länk."); }
    finally { setPending(false); }
  })()} /></main></Frame>;
  if (!auth.ready) return <Frame><main tabIndex={-1} className="content"><p role="status">Laddar Förena…</p></main></Frame>;

  async function login(email?: string, password?: string) {
    setPending(true); setError(undefined); invalidateSessionChecks();
    try {
      const session = email === undefined ? await passkeyLogin() : parseSession(await authRequest("login", { email, password }));
      if (!session) { setError("Inloggningen misslyckades. Försök igen."); return; }
      applySession(session); notifySessionChanged();
      if (path === "/login") {
        const next = new URLSearchParams(location.search).get("next");
        const oauth = oauthDestination(next);
        if (oauth) window.location.assign(oauth);
        else navigate(safeDestination(next), { replace: true });
      }
    } catch { setError("Inloggningen kunde inte genomföras. Försök igen."); }
    finally { setPending(false); }
  }
  if (!auth.session) return <Frame key="guest"><main tabIndex={-1} className="auth-page"><section className="auth-card">
    <span className="brand-mark">F</span><p className="eyebrow">Förena</p><h1>Logga in</h1>
    <p>Logga in för att se dina aktiviteter och svara på kallelser.</p>
    <PasswordLoginForm onLogin={(email, password) => void login(email, password)} onPasskey={() => void login()} pending={pending} error={error} />
    <div className="auth-form"><AppLink href="/register">Skapa konto</AppLink><AppLink href="/password/forgot">Glömt lösenord?</AppLink></div>
    <h2>Logga in utan lösenord</h2>
    <MagicLinkForm pending={pending} sent={magicSent} onRequest={email => void (async () => {
      setPending(true); setError(undefined);
      try { z.object({ ok: z.literal(true) }).parse(await authRequest("magic-link", { email })); setMagicSent(true); }
      catch { setError("Inloggningslänken kunde inte begäras just nu. Vänta en stund och försök igen."); }
      finally { setPending(false); }
    })()} />
  </section></main></Frame>;

  if (path === "/oauth/consent") return <Frame email={auth.session.user.email ?? undefined}><main className="auth-page" tabIndex={-1}><ConsentPage search={location.search} /></main></Frame>;

  const workspaceMatch = /^\/(organizations|teams)\/([^/]+)$/.exec(path);
  const workspaceId=z.uuid().safeParse(workspaceMatch?.[2]);
  const workspace=workspaceMatch && workspaceId.success ? {kind:workspaceMatch[1]==="teams" ? "team" as const : "organization" as const,id:workspaceId.data} : undefined;
  const homePath=path==="/" || path==="/login" || Boolean(workspace) || path==="/notifications";
  const match = /^\/activities\/([^/]+)$/.exec(path);
  const activityId = match?.[1] ?? (path === "/migration/participation" ? config.activityId : undefined);
  const validActivity = z.uuid().safeParse(activityId);
  const securityPage = path === "/account/security";
  const managementPage = path === "/activities/manage";
  const administrationPage = path === "/administration";
  const knownPath = administrationPage || managementPage || securityPage || homePath || path === "/migration/participation" || Boolean(match);
  async function logout() {
    setPending(true); setError(undefined);
    try {
      await authRequest("logout", {});
      applySession(null); setMagicSent(false); setPasskeyCreatedFor(undefined); notifySessionChanged();
      navigate("/login", { replace: true });
    } catch { setError("Utloggningen misslyckades. Försök igen."); }
    finally { setPending(false); }
  }
  return <Frame key={auth.session.user.id} email={auth.session.user.email ?? undefined} logout={<button type="button" className="logout-button" aria-label="Logga ut från Förena" disabled={pending} onClick={() => void logout()}>{pending ? "Loggar ut…" : "Logga ut"}</button>}>
    <main tabIndex={-1} className={`content ${homePath ? "personal-dashboard" : ""}`} key={auth.session.user.id}>
      {!homePath && !securityPage && !managementPage && !administrationPage ? <><p className="eyebrow">Personligt</p><h1>{!knownPath ? "Sidan finns inte" : "Kallelser"}</h1></> : null}
      {error ? <p role="alert">{error}</p> : null}
      {administrationPage ? <Administration request={request} /> : managementPage ? <ActivityManagement request={request} /> : securityPage ? <><PasskeyRegistration pending={pending} registered={passkeyCreatedFor === accountId} supported={Boolean(window.PublicKeyCredential && navigator.credentials)} onRegister={() => void (async () => {
        const expectedAccount = accountId;
        if (!expectedAccount || pending) return;
        setPending(true); setError(undefined);
        try { await registerPasskey(expectedAccount); if (activeAccount.current === expectedAccount) setPasskeyCreatedFor(expectedAccount); }
        catch (error) { if (activeAccount.current === expectedAccount) setError(error instanceof DOMException && error.name === "NotAllowedError" ? "Registreringen avbröts. Du kan försöka igen." : "Passkey kunde inte skapas. Försök igen senare."); }
        finally { setPending(false); }
      })()} /><PasskeyList key={auth.session.user.id} accountId={auth.session.user.id} revision={passkeyCreatedFor === accountId} /></> : !knownPath ? <AppLink href="/">Till startsidan</AppLink> : homePath ? <><p><AppLink href="/activities/manage">Hantera aktiviteter</AppLink> · <AppLink href="/administration">Administration</AppLink></p><MyActivitiesPage request={request} workspace={workspace} notifications={path==="/notifications"} /></> : validActivity.success ? <>
        <ActivityDetails key={validActivity.data} activityId={validActivity.data} request={request} />
      </> : <p>Inga kallelser att visa här ännu. Öppna länken till en aktivitet för att se dina kallelser.</p>}
    </main>
  </Frame>;
}
