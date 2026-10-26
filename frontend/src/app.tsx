import { OverviewBackLink } from "../../src/components/overview-back-link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { AppLink } from "./app-link";
import { z } from "zod";
import { Administration } from "../../src/components/administration";
import { ActivityManagement } from "../../src/components/activity-management";
import { ActivityDetails } from "./activity-details";
import { TeamRosterNavigation, TeamRosterPage } from "./team-roster";
import { MyActivitiesPage } from "./my-activities";
import { AppHeaderFrame } from "../../src/components/app-header-frame";
import { AppShellFrame } from "../../src/components/app-shell-frame";
import { AppFooter } from "../../src/components/app-footer";
import { ApplicationMenu } from "../../src/components/application-menu";
import { NavigationLinksView } from "../../src/components/navigation-links-view";
import { systemNavigationItems } from "../../src/components/system-navigation-items";
import { AdministrationProvider, useAdministrationAccess } from "../../src/components/administration-context";
import { PasswordLoginForm } from "../../src/components/password-login-form";
import { type ParticipationFetch } from "../../src/components/activity-invitation-response";
import { BrowserFrontendExamples } from "../../src/components/browser-frontend-examples";
import { createApiFetch, oauthDestination, safeDestination } from "./api";
import type { PublicConfig } from "./config";
import { authRequest, parseSession, passkeyLogin, registerPasskey, type SessionView } from "./session";

import { MagicLinkForm, MagicLinkConfirmation } from "../../src/components/magic-link-form";
import { AccountPage, ConsentPage, PasskeyList } from "./account";
import { PasskeyRegistration } from "../../src/components/passkey-registration";

function Frame({ children, email, logout, request }: { children: ReactNode; email?: string; logout?: ReactNode; request?: ParticipationFetch }) {
  const { pathname } = useLocation();
  const administration = useAdministrationAccess()?.data;
  const system = administration?.platformAdmin ?? false;
  const systemWorkspace = system && (pathname.startsWith("/system") || pathname === "/administration");
  const teamMatch = /^\/teams\/([^/]+)(?:\/members)?$/.exec(pathname);
  const teamId = z.uuid().safeParse(teamMatch?.[1]);
  const menu = <ApplicationMenu accountEmail={email} linkComponent={AppLink}
    personalNavigation={<NavigationLinksView label="Personligt" items={[{ href: "/", label: "Min översikt" }]} pathname={pathname} linkComponent={AppLink} />}
    navigation={systemWorkspace
      ? <NavigationLinksView label="Systemadministration" items={systemNavigationItems} pathname={pathname === "/administration" ? "/system" : pathname} linkComponent={AppLink} />
      : request && teamId.success ? <TeamRosterNavigation key={teamId.data} request={request} teamId={teamId.data} pathname={pathname} /> : undefined}
    accountLinks={<><AppLink href="/account/security">Inloggningsinställningar</AppLink>
      {system || administration?.canBootstrap ? <AppLink href="/system">Systemadministration</AppLink> : administration?.clubs.length ? <AppLink href="/administration">Föreningsadministration</AppLink> : null}</>}
    logout={logout} />;
  return <><div className="app-page"><AppShellFrame sidebar={menu}
    header={<AppHeaderFrame homeHref={systemWorkspace ? "/system" : "/"} linkComponent={AppLink} sidebarNavigation actions={!email ? <AppLink className="secondary" href="/login">Logga in</AppLink> : <AppLink className="notification-trigger" href="/notifications" aria-label="Visa kallelser som behöver svar"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg></AppLink>}>{menu}</AppHeaderFrame>}>
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
  const managementQuery = new URLSearchParams(location.search);
  const managementTeam = z.uuid().safeParse(managementQuery.get("team"));
  const administrationPage = path === "/administration" || path === "/system" || path.startsWith("/system/") || /^\/organizations\/[^/]+\/(?:administration|sections\/[^/]+\/teams)$/.test(path);
  const rosterMatch = /^\/teams\/([^/]+)\/members$/.exec(path);
  const rosterTeam = z.uuid().safeParse(rosterMatch?.[1]);
  const rosterPage = Boolean(rosterMatch && rosterTeam.success);
  const knownPath = rosterPage || administrationPage || managementPage || securityPage || homePath || path === "/migration/participation" || Boolean(match);
  async function logout() {
    setPending(true); setError(undefined);
    try {
      await authRequest("logout", {});
      applySession(null); setMagicSent(false); setPasskeyCreatedFor(undefined); notifySessionChanged();
      navigate("/login", { replace: true });
    } catch { setError("Utloggningen misslyckades. Försök igen."); }
    finally { setPending(false); }
  }
  return <AdministrationProvider key={auth.session.user.id} request={request} routeKey={administrationPage ? location.key : "personal"}><Frame request={request} email={auth.session.user.email ?? undefined} logout={<button type="button" className="logout-button" aria-label="Logga ut från Förena" disabled={pending} onClick={() => void logout()}>{pending ? "Loggar ut…" : "Logga ut"}</button>}>
    <main tabIndex={-1} className={administrationPage ? "application-page" : `content ${homePath ? "personal-dashboard" : ""}`} key={auth.session.user.id}>
      {validActivity.success && !managementPage ? <OverviewBackLink linkComponent={AppLink} /> : null}
      {!homePath && !securityPage && !managementPage && !administrationPage && !rosterPage ? <><p className="eyebrow">Personligt</p><h1>{!knownPath ? "Sidan finns inte" : "Kallelser"}</h1></> : null}
      {error ? <p role="alert">{error}</p> : null}
      {rosterPage && rosterTeam.success ? <TeamRosterPage key={rosterTeam.data} request={request} teamId={rosterTeam.data} /> : administrationPage ? <Administration request={request} path={path + location.search} onNavigate={navigate} linkComponent={AppLink} /> : managementPage ? <ActivityManagement key={location.search} request={request}
        initialTeamId={managementTeam.success ? managementTeam.data : undefined}
        createOnLoad={managementTeam.success && managementQuery.get("create") === "1"}
        onEditorClose={() => { if (managementTeam.success && managementQuery.get("create") === "1") navigate(`/activities/manage?team=${managementTeam.data}`, { replace: true }); }} /> : securityPage ? <><PasskeyRegistration pending={pending} registered={passkeyCreatedFor === accountId} supported={Boolean(window.PublicKeyCredential && navigator.credentials)} onRegister={() => void (async () => {
        const expectedAccount = accountId;
        if (!expectedAccount || pending) return;
        setPending(true); setError(undefined);
        try { await registerPasskey(expectedAccount); if (activeAccount.current === expectedAccount) setPasskeyCreatedFor(expectedAccount); }
        catch (error) { if (activeAccount.current === expectedAccount) setError(error instanceof DOMException && error.name === "NotAllowedError" ? "Registreringen avbröts. Du kan försöka igen." : "Passkey kunde inte skapas. Försök igen senare."); }
        finally { setPending(false); }
      })()} /><PasskeyList key={auth.session.user.id} accountId={auth.session.user.id} revision={passkeyCreatedFor === accountId} /></> : !knownPath ? <AppLink href="/">Till startsidan</AppLink> : homePath ? <MyActivitiesPage request={request} workspace={workspace} notifications={path==="/notifications"} /> : validActivity.success ? <>
        <ActivityDetails key={validActivity.data} activityId={validActivity.data} request={request} />
      </> : <p>Inga kallelser att visa här ännu. Öppna länken till en aktivitet för att se dina kallelser.</p>}
    </main>
  </Frame></AdministrationProvider>;
}
