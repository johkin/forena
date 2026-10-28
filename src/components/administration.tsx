"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { ActivityDatePicker } from "./activity-date-picker";
import { AssistantProfileEditor } from "./assistant-profile-editor";
import { ClubOnboarding } from "./club-onboarding";
import { ClubSlugInput } from "./club-slug-input";
import { ClubStructureAdministration } from "./club-structure-administration";
import { SectionTeamAdministration } from "./section-team-administration";
import { clubSlug, type ClubSetupState } from "../lib/club-administration";
import type { ParticipationFetch } from "./activity-invitation-response";

import { administratorSchema, clubSchema, sectionSchema } from "../lib/administration";
import { SystemAdministrationHome } from "./system-administration-home";
import type { NavigationLink } from "./navigation-link";
import { useAdministrationOverview } from "./administration-context";
export { administrationOverviewSchema } from "../lib/administration";
type Mutation = (path: string, method: "POST" | "PUT" | "DELETE", body?: unknown) => Promise<{ id?: string }>;
const disciplines = [{ id: "common", name: "Allmän verksamhet" }, { id: "football", name: "Fotboll" }];

export function Administration({ request, path = "/administration", onNavigate, linkComponent: Link = "a" }: {
  request: ParticipationFetch; path?: string; onNavigate?: (href: string) => void; linkComponent?: NavigationLink;
}) {
  const { data, error: loadError, refresh } = useAdministrationOverview(request);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [pending, setPending] = useState(false);
  const pendingRequest = useRef(false);
  const [createdClubId, setCreatedClubId] = useState<string>();
  const navigatedClub = useRef<string | undefined>(undefined);
  const [pathname, search = ""] = path.split("?");
  const query = new URLSearchParams(search);
  const q = (query.get("q") ?? "").trim().slice(0, 120);
  const page = Math.max(1, Math.min(10000, Number.parseInt(query.get("page") ?? "1", 10) || 1));
  useEffect(() => {
    if (createdClubId && navigatedClub.current !== createdClubId && data?.clubs.some(club => club.id === createdClubId)) {
      navigatedClub.current = createdClubId;
      onNavigate?.(`/system/organizations/${createdClubId}`);
    }
  }, [createdClubId, data, onNavigate]);
  const mutate = useCallback<Mutation>(async (path, method, body) => {
    if (pendingRequest.current) throw new Error("Vänta tills ändringen har sparats.");
    pendingRequest.current = true;
    setPending(true); setError(undefined); setNotice(undefined);
    try {
      const response = await request(path, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (!response.ok) {
        const problem = z.object({ error: z.string() }).safeParse(await response.json().catch(() => null));
        throw new Error(problem.success ? problem.data.error : "Ändringen kunde inte sparas. Försök igen.");
      }
      const result = z.object({ id: z.uuid().optional() }).parse(await response.json());
      refresh(); setNotice("Ändringen har sparats.");
      return result;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Ändringen kunde inte sparas.";
      setError(message); throw new Error(message);
    } finally { pendingRequest.current = false; setPending(false); }
  }, [request, refresh]);
  const checkSlug = useCallback(async (slug: string, organizationId?: string): Promise<"available" | "taken" | "error"> => {
    const query = new URLSearchParams({ slug, ...(organizationId ? { organizationId } : {}) });
    const response = await request(`/api/admin/slug?${query}`);
    if (!response.ok) return "error";
    return z.object({ status: z.enum(["available", "taken"]) }).parse(await response.json()).status;
  }, [request]);
  const createClub = useCallback(async (_state: ClubSetupState, form: FormData): Promise<ClubSetupState> => {
    try {
      const sectionName = String(form.get("sectionName"));
      const teamName = String(form.get("teamName") ?? "");
      const created = await mutate("/api/admin/clubs", "POST", {
        organizationName: form.get("organizationName"), organizationSlug: form.get("organizationSlug"),
        timeZone: form.get("timeZone"), sectionName, sectionSlug: clubSlug(sectionName), disciplineKey: form.get("disciplineId"),
        ...(form.get("addTeam") === "on" ? { teamName, teamSlug: clubSlug(teamName), season: form.get("season") } : {}),
      });
      if (created.id) setCreatedClubId(created.id);
      return {};
    } catch (cause) { return { error: cause instanceof Error ? cause.message : "Klubben kunde inte skapas." }; }
  }, [mutate]);
  const messages = <>{error || loadError ? <p role="alert">{error ?? loadError} <button type="button" onClick={refresh}>Försök igen</button></p> : null}
    {notice ? <p role="status">{notice}</p> : null}</>;
  const title = pathname === "/system/administrators" ? "Administratörer" : pathname === "/system/organizations" ? "Klubbar" : "Systemadministration";
  if (!data) return <section className="application-card" aria-label="Administration"><h1>{title}</h1>{messages}{!loadError ? <p role="status">Laddar administration…</p> : null}</section>;
  if (data.canBootstrap) return <section className="application-card" aria-label="Administration"><p className="eyebrow">Förena · System</p><h1>Systemadministration</h1>{messages}
    <section className="form-section"><h2>Aktivera första systemadministratören</h2>
      <p>Ditt verifierade konto är utsett i installationens konfiguration. Bekräfta för att aktivera systemadministrationen.</p>
      <button type="button" className="primary" disabled={pending} onClick={() => {
        if (window.confirm("Aktivera systemadministration för ditt verifierade konto?")) void mutate("/api/admin/bootstrap", "POST", {}).catch(() => {});
      }}>Aktivera systemadministration</button>
    </section></section>;
  if (pathname.startsWith("/system") && !data.platformAdmin) return <section className="application-card" aria-label="Administration"><h1>Systemadministration</h1>
    {messages}<p>Du saknar behörighet till systemadministrationen.</p><Link href="/">Till min översikt</Link></section>;
  if ((pathname === "/system" || pathname === "/administration") && data.platformAdmin)
    return <section aria-label="Administration">{messages}<SystemAdministrationHome linkComponent={Link} /></section>;
  if (pathname === "/system/administrators") return <section className="application-card" aria-label="Administration"><p className="eyebrow">System</p><h1>Administratörer</h1>
    <p>Systemadministratörer är plattformsroller och är helt separerade från roller i en förening.</p>{messages}
    <AdministratorForm label="Systemadministratör" path="/api/admin/platform-administrators" items={data.platformAdministrators} mutate={mutate} pending={pending} />
  </section>;
  const unavailable: Record<string, string> = { "/system/disciplines": "Discipliner", "/system/activity-types": "Aktivitetstyper", "/system/memories": "Assistentminnen" };
  if (unavailable[pathname]) return <section className="application-card" aria-label="Administration"><p className="eyebrow">System</p><h1>{unavailable[pathname]}</h1>
    <p>Den här funktionen finns i Next-appen men har ännu inte flyttats till den nya appen.</p><Link href="/system">Till systemadministrationen</Link>
  </section>;
  const teamRoute = /^\/organizations\/([^/]+)\/sections\/([^/]+)\/teams$/.exec(pathname);
  const clubId = teamRoute?.[1] ?? (pathname.startsWith("/system/organizations/") ? pathname.slice("/system/organizations/".length)
    : /^\/organizations\/([^/]+)\/administration$/.exec(pathname)?.[1]);
  if (clubId) {
    const club = data.clubs.find(item => item.id === clubId);
    if (!club) return <section className="application-card" aria-label="Administration"><h1>Klubben är inte tillgänglig</h1><p>Du saknar åtkomst eller klubben finns inte längre.</p><Link href={data.platformAdmin ? "/system/organizations" : "/administration"}>Till klubbar</Link></section>;
    if (teamRoute) {
      const section = club.sections.find(item => item.id === teamRoute[2]);
      if (!section || !section.canManage) return <section className="application-card" aria-label="Administration"><h1>Lagen är inte tillgängliga</h1><p>Du saknar behörighet till lagadministrationen i den här sektionen.</p></section>;
      return <section className="application-card" aria-label="Administration"><p className="eyebrow">{club.name} · {section.name}</p><h1>Hantera lag</h1>{messages}
        <Link href={data.platformAdmin ? `/system/organizations/${club.id}` : `/organizations/${club.id}/administration`}>Till klubbens administration</Link>
        <SectionAdministration club={club} section={section} mutate={mutate} pending={pending} />
        <AssistantProfileEditor request={request} organizationId={club.id} sectionId={section.id} />
      </section>;
    }
    return <section className="application-card" aria-label="Administration"><p className="eyebrow">{data.platformAdmin ? "System · Klubb" : "Förening"}</p><h1>{club.name}</h1>{messages}
      <ClubAdministration club={club} linkComponent={Link} platformAdmin={data.platformAdmin} mutate={mutate} pending={pending} checkSlug={checkSlug} />
      {club.canManage && !data.platformAdmin ? <AssistantProfileEditor request={request} organizationId={club.id} /> : null}
    </section>;
  }
  if (pathname !== "/system/organizations" && pathname !== "/administration")
    return <section className="application-card" aria-label="Administration"><h1>Sidan finns inte</h1><Link href="/system">Till systemadministrationen</Link></section>;
  const matching = data.clubs.filter(club => club.name.toLocaleLowerCase("sv-SE").includes(q.toLocaleLowerCase("sv-SE")));
  const listPath = data.platformAdmin ? "/system/organizations" : "/administration";
  const pageLink = (next: number) => `${listPath}?${new URLSearchParams({ page: String(next), ...(q ? { q } : {}) })}`;
  return <section className="application-card" aria-label="Administration"><p className="eyebrow">{data.platformAdmin ? "System" : "Förening"}</p><h1>Klubbar</h1>
    <p>Hantera klubbarnas uppgifter och sektioner.</p>{messages}
    <form className="club-search" key={q} onSubmit={event => {
      event.preventDefault(); const search = String(new FormData(event.currentTarget).get("q") ?? "").trim();
      onNavigate?.(`${listPath}?${new URLSearchParams({ ...(search ? { q: search } : {}) })}`);
    }}><label>Sök klubb<input name="q" defaultValue={q} maxLength={120} /></label><button className="secondary">Sök</button></form>
    <div className="system-admin-grid">{matching.slice((page - 1) * 30, page * 30).map(club => <Link key={club.id} href={data.platformAdmin ? `/system/organizations/${club.id}` : `/organizations/${club.id}/administration`}>
      <strong>{club.name}</strong><span>/o/{club.slug}</span>
    </Link>)}</div>
    {!matching.length ? <p>Inga klubbar matchar sökningen.</p> : null}
    <nav className="modal-actions" aria-label="Sidor med klubbar">{page > 1 ? <Link className="secondary" href={pageLink(page - 1)}>Föregående</Link> : null}
      {page * 30 < matching.length ? <Link className="secondary" href={pageLink(page + 1)}>Nästa</Link> : null}</nav>
    {data.platformAdmin ? <details className="club-admin-add"><summary>Skapa klubb</summary><ClubOnboarding managed disciplines={disciplines} action={createClub} checkSlug={checkSlug} /></details> : null}
  </section>;
}

function AdministratorForm({ label, path, items, mutate, pending, team = false }: {
  label: string; path: string; items: z.infer<typeof administratorSchema>[]; mutate: Mutation; pending: boolean; team?: boolean;
}) {
  const [error, setError] = useState<string>();
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!window.confirm(`Tilldela ${label.toLowerCase()} till ${String(form.get("email"))}?`)) return;
    try {
      await mutate(path, "POST", { email: form.get("email"), name: form.get("name") ?? "", active: true,
        ...(team ? { startsOn: form.get("startsOn") || null, endsOn: form.get("endsOn") || null } : {}),
      });
      setError(undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Behörigheten kunde inte sparas."); }
  }
  return <div className="club-admin-section">
    <h3>{label}</h3><p>Mottagaren måste först registrera och verifiera sitt konto. Tilldelningen börjar gälla när den sparas; ingen mejlinbjudan skickas.</p>
    <ul>{items.map(item => <li key={item.subject}>{item.email} · {item.active ? "Aktiv" : "Återkallad"}{item.startsOn ? ` · ${item.startsOn}–${item.endsOn ?? "tills vidare"}` : ""}
      {item.active ? <button type="button" className="danger" disabled={pending} onClick={() => {
        if (window.confirm(`Återkalla ${label.toLowerCase()} för ${item.email}?`)) void mutate(path, "POST", { email: item.email, active: false, ...(team ? { startsOn: item.startsOn, endsOn: item.endsOn } : {}) }).catch(() => {});
      }}>Återkalla {item.email}</button> : null}
    </li>)}</ul>
    <form className="application-form" onSubmit={event => void submit(event)}><fieldset disabled={pending}>
      <label>{label}: e-post<input name="email" type="email" required autoComplete="off" /></label>
      {team ? <><label>Visningsnamn<input name="name" required maxLength={120} /></label><p>En egen personkoppling skapas i klubben om kontot saknar en. Målsmanskopplingar används inte för lagbehörigheter.</p>
        <details><summary>Giltighet (valfritt)</summary><ActivityDatePicker name="startsOn" label="Gäller från" value={startsOn} onChange={setStartsOn}/><ActivityDatePicker name="endsOn" label="Gäller till" value={endsOn} onChange={setEndsOn}/></details></> : null}
      <button type="submit" className="primary">Tilldela {label.toLowerCase()}</button>
    </fieldset>{error ? <p role="alert">{error}</p> : null}</form>
  </div>;
}

function ClubAdministration({ club, platformAdmin, mutate, pending, checkSlug, linkComponent }: {
  club: z.infer<typeof clubSchema>; platformAdmin: boolean; mutate: Mutation; pending: boolean; linkComponent?: NavigationLink;
  checkSlug: (slug: string, organizationId?: string) => Promise<"available" | "taken" | "error">;
}) {
  const [error, setError] = useState<string>();
  const saveClub = async (form: FormData) => {
    try { await mutate(`/api/admin/clubs/${club.id}`, "PUT", { name: form.get("name"), slug: form.get("slug"), timeZone: form.get("timeZone") }); setError(undefined); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Klubben kunde inte sparas."); }
  };
  const saveSection = async (form: FormData) => {
    const id = String(form.get("sectionId") ?? "");
    const name = String(form.get("name"));
    try { await mutate(`/api/admin/clubs/${club.id}/sections${id ? `/${id}` : ""}`, id ? "PUT" : "POST", {
      name, slug: String(form.get("slug") || clubSlug(name)), disciplineKey: form.get("disciplineId"),
    }); setError(undefined); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Sektionen kunde inte sparas."); }
  };
  const deleteSection = async (form: FormData) => {
    try { await mutate(`/api/admin/sections/${String(form.get("sectionId"))}`, "DELETE"); setError(undefined); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Sektionen kunde inte tas bort."); }
  };
  return <section aria-label={`Klubb ${club.name}`}>
    {error ? <p role="alert">{error}</p> : null}
    {platformAdmin ? <AdministratorForm label="Klubbadministratör" path={`/api/admin/clubs/${club.id}/administrators`} items={club.administrators} mutate={mutate} pending={pending} /> : null}
    <ClubStructureAdministration structure={{ organization: { id: club.id, name: club.name, slug: club.slug ?? clubSlug(club.name), assistantName: "", timeZone: club.timeZone },
      sections: club.sections.map(section => ({ id: section.id, name: section.name, slug: section.slug ?? clubSlug(section.name), disciplineId: section.disciplineKey, canChangeDiscipline: section.canChangeDiscipline, teamCount: section.teams.length })),
    }} disciplines={disciplines} linkComponent={linkComponent} system={platformAdmin} canManage={club.canManage} pending={pending} assistantNameAvailable={false}
      slugField={<ClubSlugInput defaultValue={club.slug ?? clubSlug(club.name)} organizationId={club.id} checkAvailability={checkSlug} />}
      saveClub={saveClub} saveSection={saveSection} deleteSection={deleteSection}
      canManageTeams={sectionId => club.sections.some(section => section.id === sectionId && section.canManage)}
      canDeleteSection={sectionId => club.sections.some(section => section.id === sectionId && section.canDelete)}
      teamHref={sectionId => `/organizations/${club.id}/sections/${sectionId}/teams`}
      sectionTools={sectionId => club.canManage ? <AdministratorForm label="Sektionsadministratör" path={`/api/admin/sections/${sectionId}/administrators`} items={club.sections.find(section => section.id === sectionId)?.administrators ?? []} mutate={mutate} pending={pending} /> : null} />
  </section>;
}

function SectionAdministration({ club, section, mutate, pending }: { club: z.infer<typeof clubSchema>; section: z.infer<typeof sectionSchema>; mutate: Mutation; pending: boolean }) {
  const [error, setError] = useState<string>();
  const action = async (form: FormData) => {
    const id = String(form.get("teamId") ?? "");
    try { await mutate(`/api/admin/sections/${section.id}/teams${id ? `/${id}` : ""}`, id ? "PUT" : "POST", { name: form.get("name"), season: form.get("season") }); setError(undefined); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Laget kunde inte sparas."); }
  };
  const remove = async (form: FormData) => {
    try { await mutate(`/api/admin/teams/${String(form.get("teamId"))}`, "DELETE"); setError(undefined); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Laget kunde inte tas bort."); }
  };
  return <section className="club-admin-section" aria-label={`Sektion ${section.name}`}><h3>{section.name}</h3>
    {section.canManage ? <SectionTeamAdministration structure={{
      organization: { id: club.id, name: club.name, slug: club.slug ?? clubSlug(club.name), assistantName: "", timeZone: club.timeZone },
      section: { id: section.id, name: section.name, slug: section.slug ?? clubSlug(section.name), disciplineName: disciplines.find(item => item.id === section.disciplineKey)?.name ?? section.disciplineKey },
      teams: section.teams.map(team => ({ id: team.id, name: team.name, slug: team.slug ?? clubSlug(team.name), season: team.season, canDelete: team.canDelete })),
    }} saveAction={action} deleteAction={remove} teamHref={id => `/teams/${id}`}/> : null}
    {section.teams.map(team => team.canAssignAdministrators ? <details className="club-admin-section" key={team.id}><summary>Lagadministratörer för {team.name}</summary><AdministratorForm label="Lagadministratör" path={`/api/admin/teams/${team.id}/administrators`} items={team.administrators} mutate={mutate} pending={pending} team/></details> : null)}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
