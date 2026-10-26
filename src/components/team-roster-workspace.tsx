"use client";

import { useState, type ReactNode } from "react";
import type { NavigationLink } from "./navigation-link";
import { GroupEditor, RosterSubmit, TeamRoster, type RosterGroup, type RosterPerson } from "./team-roster";

export type RosterProfile = RosterPerson & {
  guardians: { name: string; phone: string }[];
  childIds: string[];
};
type Action = (data: FormData) => Promise<void>;
export type RosterActions = { updateMemberName: Action; createTeamGroup: Action; updateTeamGroup: Action; deleteTeamGroup: Action };

export function TeamRosterWorkspace({ people: roster, groups: rosterGroups, team, organization,
  destination, search, actions, pending = false, memberDetails, guardianError, childError,
  organizationSlug = "", teamSlug = "", linkComponent: Link = "a",
}: {
  people: RosterProfile[]; groups: RosterGroup[]; team: { name: string }; organization: { name: string };
  destination: string; search: string; actions: RosterActions; pending?: boolean;
  memberDetails?: ReactNode; guardianError?: boolean; childError?: boolean;
  organizationSlug?: string; teamSlug?: string; linkComponent?: NavigationLink;
}) {
  const query = new URLSearchParams(search);
  const [newGroupName, setNewGroupName] = useState("");
  const selectedPersonId = query.get("person");
  const selectedGroupId = query.get("group");
  const view = query.get("view");
  const edit = query.get("edit");
  const error = query.get("error");
  const saved = query.get("saved");
  const leaderSaved = query.get("leaderSaved");
  const invited = query.get("invited");
  const groupSaved = query.get("groupSaved");
  const groupDeleted = query.get("groupDeleted");
  const member = roster.find(person => person.id === selectedPersonId);
  const selectedGroup = rosterGroups.find(group => group.id === selectedGroupId);
  const guardians = member?.guardians;
  const children = roster.filter(person => member?.childIds.includes(person.id));
  const { updateMemberName, createTeamGroup, updateTeamGroup, deleteTeamGroup } = actions;
  return (
    <section className="application-card members-admin-card">
      <div className="application-page-heading">
        <div>
          <p className="eyebrow">
            {organization.name} · {team.name}
          </p>
          <h1>Truppen</h1>
          <p>
            {roster.length} medlemmar · {rosterGroups.length}{" "}
            {rosterGroups.length === 1 ? "undergrupp" : "undergrupper"}
          </p>
        </div>
      </div>
      {saved ? (
        <div className="auth-message" role="status">{saved} har uppdaterats.</div>
      ) : null}
      {leaderSaved ? (
        <div className="auth-message" role="status">{leaderSaved} har uppdaterats.</div>
      ) : null}
      {invited ? (
        <div className="auth-message" role="status">
          Inbjudan har skickats till {invited}.
        </div>
      ) : null}
      {groupSaved ? (
        <div className="auth-message" role="status">
          Gruppen {groupSaved} har sparats.
        </div>
      ) : null}
      {groupDeleted ? (
        <div className="auth-message" role="status">
          Gruppen {groupDeleted} har tagits bort.
        </div>
      ) : null}
      {error ? <div className="auth-error" role="alert">{error}</div> : null}
      <nav className="squad-tabs" aria-label="Truppen">
        <Link
          aria-current={member || view !== "groups" ? "page" : undefined}
          href={destination}
        >
          Medlemmar
        </Link>
        <Link
          aria-current={view === "groups" ? "page" : undefined}
          href={`${destination}?view=groups`}
        >
          Undergrupper
        </Link>
      </nav>
      {selectedPersonId && !member ? (
        <p className="auth-error">
          Medlemmen finns inte i lagets aktiva trupp.
        </p>
      ) : null}
      {member ? (
        <>
          <Link className="squad-back" href={destination}>
            ← Tillbaka till truppen
          </Link>
          <div className="squad-profile-heading">
            <span className="member-avatar" aria-hidden="true">
              {member.name
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <h2>{member.name}</h2>
              <p>{member.title}</p>
            </div>
            <Link
              className="secondary"
              href={`${destination}?person=${member.id}${edit ? "" : "&edit=1"}`}
            >
              {edit ? "Visa profil" : "Redigera medlem"}
            </Link>
          </div>
          {memberDetails ?? <RosterMemberDetails key={member.id} member={member} destination={destination} edit={Boolean(edit)} action={updateMemberName} pending={pending} linkComponent={Link} organizationSlug={organizationSlug} teamSlug={teamSlug} />}
          <section className="squad-section">
            <h3>Undergrupper</h3>
            <div className="squad-list">
              {rosterGroups
                .filter((group) => group.personIds.includes(member.id))
                .map((group) => (
                  <Link
                    className="squad-person"
                    key={group.id}
                    href={`${destination}?view=groups&group=${group.id}`}
                  >
                    <strong>{group.name}</strong>
                    <span aria-hidden="true">›</span>
                  </Link>
                ))}
            </div>
            {!rosterGroups.some((group) =>
              group.personIds.includes(member.id),
            ) ? (
              <p className="form-help">Ingår inte i någon undergrupp.</p>
            ) : null}
          </section>
          <section className="squad-section">
            <h3>Målsmän</h3>
            {guardianError ? (
              <p className="auth-error">Målsmän kunde inte hämtas.</p>
            ) : guardians?.length ? (
              <div className="squad-list">
                {guardians.map((guardian, index) => (
                  <div className="squad-person" key={index}>
                    <span className="squad-person-copy">
                      <strong>
                        {guardian.name || "Målsman"}
                      </strong>
                      {guardian.phone ? (
                        <a
                          href={`tel:${guardian.phone.replace(/[^+\d]/g, "")}`}
                        >
                          {guardian.phone}
                        </a>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="form-help">Inga målsmän registrerade.</p>
            )}
          </section>
          {childError ? (
            <p className="auth-error">Barn i laget kunde inte hämtas.</p>
          ) : children.length ? (
            <section className="squad-section">
              <h3>Barn i laget</h3>
              <div className="squad-list">
                {children.map((child) => (
                  <Link
                    key={child.id}
                    className="squad-person"
                    href={`${destination}?person=${child.id}`}
                  >
                    <strong>{child.name}</strong>
                    <span aria-hidden="true">›</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : view === "groups" ? (
        <>
          {selectedGroup ? (
            <>
              <Link
                className="squad-back"
                href={`${destination}?view=groups`}
              >
                ← Alla undergrupper
              </Link>
              <h2>{selectedGroup.name}</h2>
              <p className="form-help">
                Tryck på en person för att lägga till eller ta bort.
                Ändringarna gäller när du sparar.
              </p>
              <GroupEditor
                key={`${selectedGroup.id}:${selectedGroup.revision ?? 0}`}
                group={selectedGroup}
                people={roster}
                organizationSlug={organizationSlug}
                teamSlug={teamSlug}
                pending={pending}
                action={updateTeamGroup}
                deleteAction={deleteTeamGroup}
              />
            </>
          ) : (
            <>
              {selectedGroupId ? (
                <p className="auth-error">Gruppen kunde inte hittas.</p>
              ) : null}
              <div className="squad-list">
                {rosterGroups.map((group) => (
                  <Link
                    className="squad-person"
                    key={group.id}
                    href={`${destination}?view=groups&group=${group.id}`}
                  >
                    <span className="squad-person-copy">
                      <strong>{group.name}</strong>
                      <small>{group.personIds.length} medlemmar</small>
                    </span>
                    <span aria-hidden="true">›</span>
                  </Link>
                ))}
              </div>
              {!rosterGroups.length ? (
                <p className="squad-empty">
                  Skapa en undergrupp för till exempel matchtrupp eller
                  rotationsträning.
                </p>
              ) : null}
              <details className="squad-create">
                <summary>+ Ny undergrupp</summary>
                <form action={createTeamGroup} className="squad-form">
                  <fieldset className="squad-fieldset" disabled={pending}>
                  <input
                    type="hidden"
                    name="organizationSlug"
                    value={organizationSlug}
                  />
                  <input type="hidden" name="teamSlug" value={teamSlug} />
                  <label>
                    Gruppnamn
                    <input
                      name="name"
                      value={newGroupName}
                      onChange={event => setNewGroupName(event.target.value)}
                      required
                      maxLength={80}
                      placeholder="Till exempel Lag Gul"
                    />
                  </label>
                  <RosterSubmit>Skapa grupp</RosterSubmit>
                  </fieldset>
                </form>
              </details>
            </>
          )}
        </>
      ) : (
        <TeamRoster
          linkComponent={Link}
          people={roster}
          groups={rosterGroups}
          href={destination}
        />
      )}
    </section>
  );
}

function RosterMemberDetails({ member, destination, edit, action, pending, linkComponent: Link, organizationSlug, teamSlug }: {
  member: RosterPerson; destination: string; edit: boolean; action: Action; pending: boolean;
  linkComponent: NavigationLink; organizationSlug: string; teamSlug: string;
}) {
  const [name, setName] = useState(member.name);
  if (!edit) return <section className="squad-section"><h3>Konto</h3><p>{member.linked ? "Konto kopplat" : "Inget eget konto kopplat"}</p></section>;
  return <form action={action} className="squad-form">
    <fieldset className="squad-fieldset" disabled={pending}>
      <input name="organizationSlug" type="hidden" value={organizationSlug} />
      <input name="teamSlug" type="hidden" value={teamSlug} />
      <input name="personId" type="hidden" value={member.id} />
      <h3>Medlemsuppgifter</h3>
      <label>Namn<input name="displayName" value={name} onChange={event => setName(event.target.value)} required maxLength={160} autoComplete="name" /></label>
      <div className="squad-save-bar"><Link className="secondary" href={`${destination}?person=${member.id}`}>Avbryt</Link><RosterSubmit>Spara medlem</RosterSubmit></div>
    </fieldset>
  </form>;
}
