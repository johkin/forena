import { FootballFields } from "@/components/football-fields";
import { TeamContactDirectory } from "@/components/team-contact-directory";
import { teamContactsSchema } from "@/lib/team-contact-directory";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TeamMenu } from "@/components/team-menu";
import { AppShell } from "@/components/app-shell";
import {
  createTeamGroup,
  deleteTeamGroup,
  sendPlayerInvitation,
  updatePlayer,
  updateTeamGroup,
  updateMemberName,
} from "./actions";

import Link from "next/link";
import { primaryRosterRole, rosterRoleLabel } from "@/lib/roster-roles";
import {
  GroupEditor,
  RosterSubmit,
  TeamRoster,
} from "@/components/team-roster";

type Props = {
  params: Promise<{ organizationSlug: string; teamSlug: string }>;
  searchParams: Promise<{
    person?: string;
    view?: string;
    group?: string;
    edit?: string;
    error?: string;
    saved?: string;
    leaderSaved?: string;
    invited?: string;
    groupSaved?: string;
    groupDeleted?: string;
  }>;
};

export default async function TeamMembersPage({ params, searchParams }: Props) {
  const { organizationSlug, teamSlug } = await params;
  const {
    person: selectedPersonId,
    view,
    group: selectedGroupId,
    edit,
    error,
    saved,
    leaderSaved,
    invited,
    groupSaved,
    groupDeleted,
  } = await searchParams;
  const destination = `/o/${organizationSlug}/t/${teamSlug}/members`;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user)
    redirect(`/login?next=${encodeURIComponent(destination)}`);

  const { data: organization } = await supabase
    .from("organizations")
    .select("id, name, slug, assistant_name")
    .eq("slug", organizationSlug)
    .maybeSingle();
  const { data: team } = organization
    ? await supabase
        .from("teams")
        .select("id, name, slug, organization_id, section_id, season")
        .eq("organization_id", organization.id)
        .eq("slug", teamSlug)
        .maybeSingle()
    : { data: null };
  if (!organization || !team) redirect("/setup");

  const { data: canManage } = await supabase.rpc("has_team_permission", {
    target_team_id: team.id,
    target_permission: "roster.manage",
  });
  if (!canManage) {
    const { data: contacts, error: directoryError } = await supabase.rpc("team_contact_directory", { target_team_id: team.id });
    if (directoryError?.code === "42501") notFound();
    if (directoryError) throw new Error("Kontaktlistan kunde inte hämtas. Försök igen.");
    return <AppShell homeHref={`/o/${organizationSlug}/t/${teamSlug}`}
      accountEmail={authData.user.email}
      organization={{ id: organization.id, name: organization.name, slug: organization.slug, assistantName: organization.assistant_name }}
      team={{ id: team.id, organizationId: team.organization_id, sectionId: team.section_id, slug: team.slug, name: team.name, season: team.season ?? "" }}
      logoutDestination={`/o/${organizationSlug}/t/${teamSlug}`}
      navigation={<TeamMenu organizationSlug={organizationSlug} teamSlug={teamSlug} teamName={team.name} canManageRoster={false} leaderView={false} activeItem="members" navigationOnly />}>
      <main className="content"><TeamContactDirectory people={teamContactsSchema.parse(contacts)} /></main>
    </AppShell>;
  }
  const { data: isAdmin } = await supabase.rpc("has_organization_role", {
    target_organization_id: organization.id,
    allowed_roles: ["owner", "admin"],
  });

  const { data: accessibleTeams } = await supabase
    .from("teams")
    .select("id, name, slug")
    .eq("organization_id", organization.id)
    .order("name");
  const workspaces = [
    {
      id: organization.id,
      kind: "organization" as const,
      name: organization.name,
      description: "Förening",
      href: `/o/${organizationSlug}`,
      active: false,
    },
    ...(accessibleTeams ?? []).map((item) => ({
      id: item.id,
      kind: "team" as const,
      name: item.name,
      description: "Lag",
      href: `/o/${organizationSlug}/t/${item.slug}`,
      active: item.id === team.id,
    })),
  ];

  const { data: memberships, error: membershipsError } = await supabase
    .from("memberships")
    .select("person_id, role")
    .eq("team_id", team.id)
    .is("ends_on", null);
  if (membershipsError) throw new Error("Truppen kunde inte hämtas");
  const personIds = [
    ...new Set((memberships ?? []).map((item) => item.person_id)),
  ];

  const [
    { data: people, error: peopleError },
    { data: loginEmails, error: loginEmailsError },
    { data: groups, error: groupsError },
    { data: responsibilities },
  ] = await Promise.all([
    personIds.length
      ? supabase
          .from("people")
          .select("id, display_name, user_id")
          .in("id", personIds)
          .order("display_name")
      : Promise.resolve({ data: [], error: null }),
    personIds.length
      ? supabase
          .from("person_login_emails")
          .select("person_id, email")
          .in("person_id", personIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("team_groups")
      .select("id, name")
      .eq("team_id", team.id)
      .order("name"),
    supabase
      .from("team_responsibilities")
      .select("person_id, responsibility_type_id")
      .eq("team_id", team.id)
      .is("ends_on", null),
  ]);
  if (peopleError || loginEmailsError || groupsError)
    throw new Error("Medlemsuppgifterna kunde inte hämtas");
  const responsibilityTypeIds = [
    ...new Set(
      (responsibilities ?? []).map((item) => item.responsibility_type_id),
    ),
  ];
  const { data: responsibilityTypes } = responsibilityTypeIds.length
    ? await supabase
        .from("responsibility_types")
        .select("id, name")
        .in("id", responsibilityTypeIds)
    : { data: [] };
  const responsibilityNameById = new Map(
    (responsibilityTypes ?? []).map((item) => [item.id, item.name]),
  );
  const responsibilitiesByPerson = new Map<string, string[]>();
  for (const item of responsibilities ?? []) {
    const name = responsibilityNameById.get(item.responsibility_type_id);
    if (!name) continue;
    responsibilitiesByPerson.set(item.person_id, [
      ...(responsibilitiesByPerson.get(item.person_id) ?? []),
      name,
    ]);
  }
  const { data: groupMembers, error: groupMembersError } = groups?.length
    ? await supabase
        .from("team_group_members")
        .select("group_id, person_id")
        .in(
          "group_id",
          groups.map((group) => group.id),
        )
    : { data: [], error: null };
  if (groupMembersError) throw new Error("Gruppmedlemmarna kunde inte hämtas");
  const groupPersonIds = new Map<string, Set<string>>();
  for (const item of groupMembers ?? []) {
    const ids = groupPersonIds.get(item.group_id) ?? new Set<string>();
    ids.add(item.person_id);
    groupPersonIds.set(item.group_id, ids);
  }
  const emailByPerson = new Map(
    (loginEmails ?? []).map((item) => [item.person_id, item.email]),
  );

  const roster = (people ?? []).map((person) => ({
    id: person.id,
    name: person.display_name,
    roles: [
      ...new Set(
        (memberships ?? [])
          .filter((item) => item.person_id === person.id)
          .map((item) => item.role),
      ),
    ],
    title:
      responsibilitiesByPerson.get(person.id)?.join(" · ") ||
      rosterRoleLabel(
        primaryRosterRole(
          (memberships ?? [])
            .filter((item) => item.person_id === person.id)
            .map((item) => item.role),
        ),
      ),
    linked: Boolean(person.user_id),
  }));
  const rosterGroups = (groups ?? []).map((group) => ({
    ...group,
    personIds: [...(groupPersonIds.get(group.id) ?? [])].filter((id) =>
      personIds.includes(id),
    ),
  }));
  const member = roster.find((person) => person.id === selectedPersonId);
  const selectedGroup = rosterGroups.find(
    (group) => group.id === selectedGroupId,
  );
  const { data: guardians, error: guardianError } = member
    ? await supabase
        .from("person_guardians")
        .select("contact_name, contact_phone")
        .eq("person_id", member.id)
        .eq("organization_id", organization.id)
    : { data: [], error: null };
  const { data: childLinks, error: childError } =
    member &&
    people?.find((person) => person.id === member.id)?.user_id &&
    personIds.length
      ? await supabase
          .from("person_guardians")
          .select("person_id")
          .eq(
            "guardian_user_id",
            people.find((person) => person.id === member.id)!.user_id!,
          )
          .eq("organization_id", organization.id)
          .in("person_id", personIds)
      : { data: [], error: null };
  const children = roster.filter((person) =>
    childLinks?.some((link) => link.person_id === person.id),
  );

  return (
    <>
      <AppShell
        homeHref={`/o/${organizationSlug}/t/${teamSlug}`}
        navigation={
          <TeamMenu
            organizationSlug={organizationSlug}
            teamSlug={teamSlug}
            teamName={team.name}
            canManageRoster={Boolean(canManage)}
            leaderView
            activeItem="members"
            navigationOnly
          />
        }
        accountEmail={authData.user.email}
        organization={{
          id: organization.id,
          slug: organization.slug,
          name: organization.name,
          assistantName: organization.assistant_name,
        }}
        team={{
          id: team.id,
          slug: team.slug,
          name: team.name,
          organizationId: team.organization_id,
          sectionId: team.section_id,
          season: team.season ?? "",
        }}
        workspaces={workspaces}
        logoutDestination={`/o/${organizationSlug}/t/${teamSlug}`}
        adminHref={isAdmin ? `/o/${organizationSlug}/admin/roles` : undefined}
      >
        <main className="content">
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
              <div className="auth-message">{saved} har uppdaterats.</div>
            ) : null}
            {leaderSaved ? (
              <div className="auth-message">{leaderSaved} har uppdaterats.</div>
            ) : null}
            {invited ? (
              <div className="auth-message">
                Inbjudan har skickats till {invited}.
              </div>
            ) : null}
            {groupSaved ? (
              <div className="auth-message">
                Gruppen {groupSaved} har sparats.
              </div>
            ) : null}
            {groupDeleted ? (
              <div className="auth-message">
                Gruppen {groupDeleted} har tagits bort.
              </div>
            ) : null}
            {error ? <div className="auth-error">{error}</div> : null}
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
                {member.roles.includes("participant") ? <FootballFields teamId={team.id} scope="teamMembership" personId={member.id}/> : null}
                {edit ? (
                  <form
                    action={
                      member.roles.includes("participant")
                        ? updatePlayer
                        : updateMemberName
                    }
                    className="squad-form"
                  >
                    <input
                      name="organizationSlug"
                      type="hidden"
                      value={organizationSlug}
                    />
                    <input name="teamSlug" type="hidden" value={teamSlug} />
                    <input name="personId" type="hidden" value={member.id} />
                    <h3>Medlemsuppgifter</h3>
                    <label>
                      Namn
                      <input
                        name="displayName"
                        defaultValue={member.name}
                        required
                        maxLength={160}
                        autoComplete="name"
                      />
                    </label>
                    {member.roles.includes("participant") ? (
                      <>
                        <label>
                          E-post för egen inloggning
                          <input
                            name="email"
                            type="email"
                            defaultValue={emailByPerson.get(member.id) ?? ""}
                            readOnly={member.linked}
                            autoComplete="email"
                          />
                        </label>
                        <p className="form-help">
                          En ny e-postadress får automatiskt en inbjudan.{" "}
                          {member.linked
                            ? "Adressen är låst eftersom ett konto redan är kopplat."
                            : "Lämna tomt om spelaren använder målsmans konto."}
                        </p>
                      </>
                    ) : null}
                    <div className="squad-save-bar">
                      <Link
                        className="secondary"
                        href={`${destination}?person=${member.id}`}
                      >
                        Avbryt
                      </Link>
                      <RosterSubmit>Spara medlem</RosterSubmit>
                    </div>
                  </form>
                ) : (
                  <section className="squad-section">
                    <h3>Konto</h3>
                    <p>
                      {member.linked
                        ? "Konto kopplat"
                        : "Inget eget konto kopplat"}
                    </p>
                    {member.roles.includes("participant") &&
                    emailByPerson.get(member.id) ? (
                      <>
                        <p className="squad-contact">
                          {emailByPerson.get(member.id)}
                        </p>
                        <form action={sendPlayerInvitation}>
                          <input
                            type="hidden"
                            name="organizationSlug"
                            value={organizationSlug}
                          />
                          <input
                            type="hidden"
                            name="teamSlug"
                            value={teamSlug}
                          />
                          <input
                            type="hidden"
                            name="personId"
                            value={member.id}
                          />
                          <input
                            type="hidden"
                            name="displayName"
                            value={member.name}
                          />
                          <RosterSubmit>
                            {member.linked
                              ? "Skicka inloggningslänk"
                              : "Skicka inbjudan igen"}
                          </RosterSubmit>
                        </form>
                      </>
                    ) : null}
                  </section>
                )}
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
                              {guardian.contact_name || "Målsman"}
                            </strong>
                            {guardian.contact_phone ? (
                              <a
                                href={`tel:${guardian.contact_phone.replace(/[^+\d]/g, "")}`}
                              >
                                {guardian.contact_phone}
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
                      key={selectedGroup.id}
                      group={selectedGroup}
                      people={roster}
                      organizationSlug={organizationSlug}
                      teamSlug={teamSlug}
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
                            required
                            maxLength={80}
                            placeholder="Till exempel Lag Gul"
                          />
                        </label>
                        <RosterSubmit>Skapa grupp</RosterSubmit>
                      </form>
                    </details>
                  </>
                )}
              </>
            ) : (
              <TeamRoster
                people={roster}
                groups={rosterGroups}
                href={destination}
              />
            )}
          </section>
        </main>
      </AppShell>
    </>
  );
}

