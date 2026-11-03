import { RosterRegistration, RosterLogin } from "../../src/components/roster-registration";
import { useTeamSettingsAccess } from "./team-activity-settings";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { z } from "zod";
import type { ParticipationFetch } from "../../src/components/activity-invitation-response";
import { TeamRosterWorkspace, type RosterActions } from "../../src/components/team-roster-workspace";
import { primaryRosterRole, rosterRoleLabel } from "../../src/lib/roster-roles";
import { AppLink } from "./app-link";
import { NavigationLinksView } from "../../src/components/navigation-links-view";
import { TeamDisciplinePlayers } from "../../src/components/team-capability-signals";
import { ExtensionFields } from "../../src/components/extension-fields";

const groupSchema = z.object({ id: z.uuid(), name: z.string(), personIds: z.array(z.uuid()), revision: z.number().int().nonnegative() });
export const rosterSchema = z.object({
  team: z.object({ id: z.uuid(), name: z.string(), organizationName: z.string() }),
  people: z.array(z.object({ id: z.uuid(), name: z.string(), roles: z.array(z.string()), title: z.string(), linked: z.boolean(),
    guardians: z.array(z.object({ name: z.string(), phone: z.string() })), email: z.string().nullable().optional(), invitationStatus: z.string().nullable().optional(), childIds: z.array(z.uuid()) })),
  groups: z.array(groupSchema),
});

export function TeamRosterPage({ request, teamId }: { request: ParticipationFetch; teamId: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState<z.infer<typeof rosterSchema>>();
  const [readOnly, setReadOnly] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const writing = useRef(false);
  const active = useRef(true);
  const base = `/api/teams/${teamId}/roster`;
  const destination = `/teams/${teamId}/members`;

  useEffect(() => {
    const controller = new AbortController();
    active.current = true;
    const failureMessage = "Truppen kunde inte hämtas. Försök igen.";
    request(base, { signal: controller.signal }).then(async response => {
      if (response.status === 403) {
        if (!controller.signal.aborted) setReadOnly(true);
        return;
      }
      if (!response.ok) throw new Error();
      const parsed = rosterSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error();
      return parsed.data;
    }).then(snapshot => { if (!controller.signal.aborted && snapshot) { setReadOnly(false); setData(snapshot); setError(undefined); } })
      .catch(() => { if (!controller.signal.aborted) setError(failureMessage); });
    return () => { active.current = false; controller.abort(); };
  }, [request, base, attempt]);

  async function write(path: string, method: string, body: unknown, next: string, success: string) {
    if (writing.current) return;
    writing.current = true;
    setPending(true); setError(undefined); setMessage(undefined);
    let failureMessage = "Ändringen kunde inte sparas. Ditt utkast finns kvar.";
    try {
      const response = await request(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) });
      if (!response.ok) {
        const failure = z.object({ error: z.string() }).safeParse(await response.json().catch(() => null));
        if (failure.success) failureMessage = failure.data.error;
        throw new Error();
      }
      if (!active.current) return;
      setMessage(success);
      failureMessage = "Ändringen har sparats, men truppen kunde inte hämtas igen. Uppdatera sidan.";
      const refreshed = await request(base);
      if (!refreshed.ok) throw new Error();
      const parsed = rosterSchema.safeParse(await refreshed.json());
      if (!parsed.success) throw new Error();
      const snapshot = parsed.data;
      if (!active.current) return;
      setData(snapshot);
      navigate(destination + next);
    } catch {
      if (active.current) setError(failureMessage);
    } finally {
      writing.current = false;
      if (active.current) setPending(false);
    }
  }

  const selectedPerson = data?.people.find(person => person.id === new URLSearchParams(location.search).get("person"));
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const actions: RosterActions = {
    updateMemberName: form => write(`${base}/members/${encodeURIComponent(String(form.get("personId")))}`, "PUT",
      { name: String(form.get("displayName") ?? "") }, `?person=${encodeURIComponent(String(form.get("personId")))}`, "Medlemmen har uppdaterats."),
    createTeamGroup: form => write(`${base}/groups`, "POST", { name: String(form.get("name") ?? "") }, "?view=groups", "Gruppen har sparats."),
    updateTeamGroup: form => write(`${base}/groups/${encodeURIComponent(String(form.get("groupId")))}`, "PUT",
      { name: String(form.get("name") ?? ""), personIds: form.getAll("personIds").map(String), revision: Number(form.get("revision")) },
      `?view=groups&group=${encodeURIComponent(String(form.get("groupId")))}`, "Gruppen har sparats."),
    deleteTeamGroup: form => write(`${base}/groups/${encodeURIComponent(String(form.get("groupId")))}?revision=${encodeURIComponent(String(form.get("revision")))}`,
      "DELETE", undefined, "?view=groups", "Gruppen har tagits bort. Medlemmarna finns kvar i laget."),
  };
  if (readOnly) return <>
    <AppLink className="squad-back" href={`/teams/${teamId}`}>← Tillbaka till laget</AppLink>
    <h1>Truppen</h1><TeamDisciplinePlayers teamId={teamId} request={request} />
  </>;
  if (!data) return <><h1>Truppen</h1>{error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Försök igen</button></div> : <p role="status">Laddar truppen…</p>}</>;
  const query = new URLSearchParams(location.search);
  if (error) query.set("error", error);
  return <>
    <AppLink className="squad-back" href={`/teams/${teamId}`}>← Tillbaka till laget</AppLink>
    {message ? <p className="auth-message" role="status">{message}</p> : null}
    <TeamRosterWorkspace people={data.people.map(person => ({ ...person, title: person.title || rosterRoleLabel(primaryRosterRole(person.roles)) }))}
      groups={data.groups} team={data.team} organization={{ name: data.team.organizationName }} destination={destination}
      search={query.toString()} actions={actions} pending={pending} linkComponent={AppLink}
      memberTools={<RosterRegistration key={location.key} today={today} pending={pending} onSearch={async value => {
        const response = await request(`${base}/candidates?q=${encodeURIComponent(value)}`);
        if (!response.ok) throw new Error();
        return z.array(z.object({ id: z.uuid(), name: z.string(), birthDate: z.string().nullable() })).parse(await response.json());
      }} onCreate={value => write(`${base}/members`, "POST", value, "", "Medlemmen har lagts till. Eventuell inbjudan väntar på utskick. Uppdatera sidan för aktuell leveransstatus.")} />}
      memberExtraDetails={<>{selectedPerson ? <RosterLogin key={selectedPerson.id} email={selectedPerson.email} linked={selectedPerson.linked}
        status={selectedPerson.invitationStatus} pending={pending} onInvite={email => write(`${base}/members/${selectedPerson.id}/invitation`, "POST", { email },
          `?person=${selectedPerson.id}`, "Inbjudan väntar på utskick. Uppdatera sidan för aktuell leveransstatus.")} /> : null}{data.people.some(p => p.id === query.get("person") && p.roles.includes("participant")) ?
        <ExtensionFields request={request} teamId={teamId} scope="teamMembership" personId={query.get("person") ?? undefined} /> : undefined}</>} />
  </>;
}

export function TeamRosterNavigation({ request, teamId, pathname }: { request: ParticipationFetch; teamId: string; pathname: string }) {
  const allowed = useRosterAccess(request, teamId);
  const settings = useTeamSettingsAccess(request, teamId);
  const base = `/teams/${teamId}`;
  return <NavigationLinksView label="Lag" pathname={pathname} linkComponent={AppLink} items={[
    { href: base, label: "Översikt" },
    ...(allowed ? [{ href: `${base}/members`, label: "Truppen" }] : []),
    ...(settings.status === "allowed" ? [{ href: `${base}/settings`, label: "Aktivitetsinställningar" }] : []),
  ]} />;
}

function useRosterAccess(request: ParticipationFetch, teamId: string) {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    request(`/api/teams/${teamId}/roster/access`, { signal: controller.signal })
      .then(async response => {
        if (response.ok && await response.json() === true) return true;
        const players = await request(`/api/teams/${teamId}/discipline-players`, { signal: controller.signal });
        return players.ok;
      })
      .then(value => { if (!controller.signal.aborted) setAllowed(value); })
      .catch(() => { if (!controller.signal.aborted) setAllowed(false); });
    return () => controller.abort();
  }, [request, teamId]);
  return allowed;
}
