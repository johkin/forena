"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { ActivityDatePicker } from "./activity-date-picker";
import { ClubOnboarding } from "./club-onboarding";
import { ClubSlugInput } from "./club-slug-input";
import { TimeZoneSelect } from "./time-zone-select";
import { SectionTeamAdministration } from "./section-team-administration";
import { clubSlug, type ClubSetupState } from "../lib/club-administration";
import type { ParticipationFetch } from "./activity-invitation-response";

const administratorSchema = z.object({ subject: z.uuid(), email: z.string(), active: z.boolean(), startsOn: z.string().nullable(), endsOn: z.string().nullable() });
const teamSchema = z.object({ id: z.uuid(), name: z.string(), slug: z.string().nullable(), season: z.string(), canManage: z.boolean(), canDelete: z.boolean(), canAssignAdministrators: z.boolean(), administrators: z.array(administratorSchema) });
const sectionSchema = z.object({ id: z.uuid(), name: z.string(), slug: z.string().nullable(), disciplineKey: z.string(), canManage: z.boolean(), canChangeDiscipline: z.boolean(), canDelete: z.boolean(), administrators: z.array(administratorSchema), teams: z.array(teamSchema) });
const clubSchema = z.object({ id: z.uuid(), name: z.string(), slug: z.string().nullable(), timeZone: z.string(), canManage: z.boolean(), administrators: z.array(administratorSchema), sections: z.array(sectionSchema) });
export const administrationOverviewSchema = z.object({ platformAdmin: z.boolean(), canBootstrap: z.boolean(), platformAdministrators: z.array(administratorSchema), clubs: z.array(clubSchema) });
type Overview = z.infer<typeof administrationOverviewSchema>;
type Mutation = (path: string, method: "POST" | "PUT" | "DELETE", body?: unknown) => Promise<void>;
const disciplines = [{ id: "common", name: "Allmän verksamhet" }, { id: "football", name: "Fotboll" }];

export function Administration({ request }: { request: ParticipationFetch }) {
  const [data, setData] = useState<Overview>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [pending, setPending] = useState(false);
  const pendingRequest = useRef(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    request("/api/admin/overview", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Administrationen kunde inte hämtas.");
      return administrationOverviewSchema.parse(await response.json());
    }).then(result => { if (!controller.signal.aborted) { setData(result); setError(undefined); } })
      .catch(() => { if (!controller.signal.aborted) setError("Administrationen kunde inte hämtas. Försök igen."); });
    return () => controller.abort();
  }, [request, attempt]);

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
      setAttempt(value => value + 1); setNotice("Ändringen har sparats.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Ändringen kunde inte sparas.";
      setError(message); throw new Error(message);
    } finally { pendingRequest.current = false; setPending(false); }
  }, [request]);
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
      await mutate("/api/admin/clubs", "POST", {
        organizationName: form.get("organizationName"), organizationSlug: form.get("organizationSlug"),
        timeZone: form.get("timeZone"), sectionName, sectionSlug: clubSlug(sectionName), disciplineKey: form.get("disciplineId"),
        ...(form.get("addTeam") === "on" ? { teamName, teamSlug: clubSlug(teamName), season: form.get("season") } : {}),
      });
      return {};
    } catch (cause) { return { error: cause instanceof Error ? cause.message : "Klubben kunde inte skapas." }; }
  }, [mutate]);
  return <section className="club-administration" aria-label="Administration">
    <h1>Administration</h1>
    {error ? <p role="alert">{error} <button type="button" onClick={() => setAttempt(value => value + 1)}>Försök igen</button></p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {!data ? <p role="status">Laddar administration…</p> : <>
      {data.canBootstrap ? <section className="card"><h2>Aktivera första systemadministratören</h2>
        <p>Ditt verifierade konto är utsett i installationens konfiguration. Bekräfta för att aktivera systemadministrationen.</p>
        <button type="button" className="primary" disabled={pending} onClick={() => {
          if (window.confirm("Aktivera systemadministration för ditt verifierade konto?")) void mutate("/api/admin/bootstrap", "POST", {}).catch(() => {});
        }}>Aktivera systemadministration</button>
      </section> : null}
      {data.platformAdmin ? <>
        <details className="card"><summary>Systemadministratörer</summary><AdministratorForm label="Systemadministratör" path="/api/admin/platform-administrators" items={data.platformAdministrators} mutate={mutate} pending={pending} /></details>
        <details className="card"><summary>Skapa klubb</summary><ClubOnboarding managed disciplines={disciplines} action={createClub} checkSlug={checkSlug} /></details>
      </> : null}
      {!data.platformAdmin && !data.canBootstrap && data.clubs.length === 0 ? <p>Du saknar administratörsbehörighet. En administratör behöver tilldela ditt verifierade konto en roll. Vid en ny installation anger serveransvarig adressen för den första systemadministratören.</p> : null}
      {data.clubs.map(club => <ClubAdministration key={club.id} club={club} platformAdmin={data.platformAdmin} mutate={mutate} pending={pending} checkSlug={checkSlug} />)}
    </>}
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

function ClubAdministration({ club, platformAdmin, mutate, pending, checkSlug }: {
  club: z.infer<typeof clubSchema>; platformAdmin: boolean; mutate: Mutation; pending: boolean;
  checkSlug: (slug: string, organizationId?: string) => Promise<"available" | "taken" | "error">;
}) {
  const [error, setError] = useState<string>();
  async function updateClub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try { await mutate(`/api/admin/clubs/${club.id}`, "PUT", { name: form.get("name"), slug: form.get("slug"), timeZone: form.get("timeZone") }); setError(undefined); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Klubben kunde inte sparas."); }
  }
  return <section className="card" aria-label={`Klubb ${club.name}`}><h2>{club.name}</h2>
    {club.canManage ? <form className="application-form" onSubmit={event => void updateClub(event)}><fieldset disabled={pending}>
      <label>Klubbens namn<input name="name" defaultValue={club.name} required maxLength={120}/></label>
      <ClubSlugInput defaultValue={club.slug ?? clubSlug(club.name)} organizationId={club.id} checkAvailability={checkSlug}/>
      <TimeZoneSelect defaultValue={club.timeZone}/><button type="submit" className="primary">Spara klubb</button>
    </fieldset></form> : null}
    {error ? <p role="alert">{error}</p> : null}
    {platformAdmin ? <AdministratorForm label="Klubbadministratör" path={`/api/admin/clubs/${club.id}/administrators`} items={club.administrators} mutate={mutate} pending={pending}/> : null}
    {club.sections.map(section => <SectionAdministration key={section.id} club={club} section={section} mutate={mutate} pending={pending}/>)}
    {club.canManage ? <SectionForm clubId={club.id} mutate={mutate} pending={pending}/> : null}
  </section>;
}

function SectionForm({ clubId, section, mutate, pending }: { clubId: string; section?: z.infer<typeof sectionSchema>; mutate: Mutation; pending: boolean }) {
  const [error, setError] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const name = String(form.get("name"));
    try {
      await mutate(`/api/admin/clubs/${clubId}/sections${section ? `/${section.id}` : ""}`, section ? "PUT" : "POST", {
        name, slug: String(form.get("slug") || clubSlug(name)), disciplineKey: form.get("disciplineKey") || section?.disciplineKey,
      }); setError(undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Sektionen kunde inte sparas."); }
  }
  return <form className="application-form club-admin-section" onSubmit={event => void submit(event)}><h3>{section ? "Ändra sektion" : "Lägg till sektion"}</h3><fieldset disabled={pending}>
    <label>Sektionens namn<input name="name" defaultValue={section?.name} required maxLength={120}/></label>
    <label>Sektionens adressnamn<input name="slug" defaultValue={section?.slug ?? ""} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={120}/></label>
    <label>Disciplin<select name="disciplineKey" defaultValue={section?.disciplineKey ?? "common"} disabled={section && !section.canChangeDiscipline}>{disciplines.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    {section && !section.canChangeDiscipline ? <p>Disciplinen kan inte ändras när sektionen har lag eller sparade förval.</p> : null}
    <button type="submit" className="primary">Spara sektion</button>
  </fieldset>{error ? <p role="alert">{error}</p> : null}</form>;
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
    {club.canManage ? <><SectionForm clubId={club.id} section={section} mutate={mutate} pending={pending}/><button type="button" className="danger" disabled={pending || !section.canDelete} onClick={() => {
      if (window.confirm(`Ta bort sektionen ${section.name}?`)) void mutate(`/api/admin/sections/${section.id}`, "DELETE").catch(() => {});
    }}>Ta bort sektion</button><AdministratorForm label="Sektionsadministratör" path={`/api/admin/sections/${section.id}/administrators`} items={section.administrators} mutate={mutate} pending={pending}/></> : null}
    {section.canManage ? <SectionTeamAdministration structure={{
      organization: { id: club.id, name: club.name, slug: club.slug ?? clubSlug(club.name), assistantName: "", timeZone: club.timeZone },
      section: { id: section.id, name: section.name, slug: section.slug ?? clubSlug(section.name), disciplineName: disciplines.find(item => item.id === section.disciplineKey)?.name ?? section.disciplineKey },
      teams: section.teams.map(team => ({ id: team.id, name: team.name, slug: team.slug ?? clubSlug(team.name), season: team.season, canDelete: team.canDelete })),
    }} saveAction={action} deleteAction={remove} teamHref={id => `/teams/${id}`}/> : null}
    {section.teams.map(team => team.canAssignAdministrators ? <details className="club-admin-section" key={team.id}><summary>Lagadministratörer för {team.name}</summary><AdministratorForm label="Lagadministratör" path={`/api/admin/teams/${team.id}/administrators`} items={team.administrators} mutate={mutate} pending={pending} team/></details> : null)}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
