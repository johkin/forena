"use client";

import { createContext, useContext, useState, type AnchorHTMLAttributes } from "react";
import { TeamRosterWorkspace, type RosterActions, type RosterProfile } from "./team-roster-workspace";
import type { RosterGroup } from "./team-roster";

const ExampleNavigation = createContext<(href: string) => void>(() => {});
function ExampleLink({ href = "", onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const navigate = useContext(ExampleNavigation);
  return <a href={href} {...props} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    event.preventDefault(); navigate(href);
  }} />;
}

const initialPeople: RosterProfile[] = [
  { id: "leader", name: "Robin Andersson med ett långt efternamn", roles: ["leader", "participant"], title: "Tränare · Lagledare", linked: true,
    guardians: [], childIds: ["player"] },
  { id: "player", name: "Alex Andersson med ett långt efternamn", roles: ["participant"], title: "Spelare", linked: false,
    guardians: [{ name: "Robin Andersson med ett långt efternamn", phone: "+46 70 123 45 67" }], childIds: [] },
  { id: "volunteer", name: "Kim Exempel", roles: ["volunteer"], title: "Volontär", linked: false, guardians: [], childIds: [] },
];

/** The same production workspace as both apps, with reversible local mutations. */
export function TeamRosterExample() {
  const [mode, setMode] = useState("members");
  const [people, setPeople] = useState(initialPeople);
  const [groups, setGroups] = useState<RosterGroup[]>([{ id: "yellow", name: "Lag Gul", personIds: ["player"], revision: 0 }]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string>();
  const destination = "/example/roster";
  const navigate = (href: string) => setSearch(href.split("?")[1] ?? "");
  const actions: RosterActions = {
    updateMemberName: async form => {
      setPeople(previous => previous.map(person => person.id === form.get("personId") ? { ...person, name: String(form.get("displayName")) } : person));
      setSearch(`person=${form.get("personId")}`); setMessage("Medlemmen har uppdaterats.");
    },
    createTeamGroup: async form => {
      setGroups(previous => [...previous, { id: crypto.randomUUID(), name: String(form.get("name")), personIds: [], revision: 0 }]);
      setSearch("view=groups"); setMessage("Gruppen har sparats.");
    },
    updateTeamGroup: async form => {
      setGroups(previous => previous.map(group => group.id === form.get("groupId")
        ? { ...group, name: String(form.get("name")), personIds: form.getAll("personIds").map(String), revision: (group.revision ?? 0) + 1 } : group));
      setMessage("Gruppen har sparats.");
    },
    deleteTeamGroup: async form => {
      setGroups(previous => previous.filter(group => group.id !== form.get("groupId")));
      setSearch("view=groups"); setMessage("Gruppen har tagits bort. Medlemmarna finns kvar i laget.");
    },
  };
  return <section id="team-roster-example">
    <h2>Truppen – medlemmar och undergrupper</h2>
    <p>Gemensamma produktionskomponenter med syntetiska uppgifter. Ändringar sparas bara i detta exempel.</p>
    <label>Truppläge<select aria-label="Truppläge" value={mode} onChange={event => {
      const next = event.target.value;
      setMode(next); setMessage(undefined);
      setSearch(next === "profile" ? "person=player" : next === "edit" ? "person=leader&edit=1" : next === "groups" ? "view=groups" : next === "group" ? "view=groups&group=yellow" : "");
    }}>
      <option value="members">Medlemslista</option><option value="profile">Profil med målsman</option>
      <option value="edit">Redigera ledarens namn</option><option value="groups">Undergrupper</option>
      <option value="group">Gruppens personval</option><option value="empty">Tom trupp</option>
      <option value="loading">Laddning</option><option value="error">Sparfel med bevarat utkast</option>
      <option value="pending">Sparande pågår</option><option value="denied">Ingen behörighet</option>
    </select></label>
    {mode === "loading" ? <p role="status">Laddar truppen…</p> : mode === "denied" ? <p role="alert">Du saknar behörighet att hantera truppen.</p> : <ExampleNavigation value={navigate}>
      {message ? <p className="auth-message" role="status">{message}</p> : null}
      <TeamRosterWorkspace key={mode} people={mode === "empty" ? [] : people} groups={mode === "empty" ? [] : groups}
        team={{ name: "Ungdomslaget" }} organization={{ name: "Exempelföreningen" }} destination={destination}
        search={mode === "error" ? `${search}&error=${encodeURIComponent("Ändringen kunde inte sparas. Ditt utkast finns kvar.")}` : mode === "pending" ? "view=groups&group=yellow" : search}
        actions={mode === "error" ? { updateMemberName: async () => {}, createTeamGroup: async () => {}, updateTeamGroup: async () => {}, deleteTeamGroup: async () => {} } : actions}
        pending={mode === "pending"} linkComponent={ExampleLink} />
    </ExampleNavigation>}
  </section>;
}
