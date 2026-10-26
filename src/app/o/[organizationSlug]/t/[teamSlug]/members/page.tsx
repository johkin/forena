import { DisciplineFields } from "@/components/discipline-fields";
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
import { NextNavigationLink } from "@/components/next-navigation-link";
import { primaryRosterRole, rosterRoleLabel } from "@/lib/roster-roles";
import {
  RosterSubmit,
} from "@/components/team-roster";
import { TeamRosterWorkspace } from "@/components/team-roster-workspace";

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
          <TeamRosterWorkspace
            people={roster.map(person => ({ ...person,
              guardians: person.id === member?.id ? (guardians ?? []).map(guardian => ({ name: guardian.contact_name || "Målsman", phone: guardian.contact_phone ?? "" })) : [],
              childIds: person.id === member?.id ? children.map(child => child.id) : [],
            }))}
            groups={rosterGroups} team={team} organization={organization}
            destination={destination} search={new URLSearchParams(Object.entries({ person: selectedPersonId, view, group: selectedGroupId, edit, error, saved, leaderSaved, invited, groupSaved, groupDeleted }).filter((entry): entry is [string, string] => typeof entry[1] === "string")).toString()}
            actions={{ updateMemberName, createTeamGroup, updateTeamGroup, deleteTeamGroup }}
            organizationSlug={organizationSlug} teamSlug={teamSlug} linkComponent={NextNavigationLink}
            guardianError={Boolean(guardianError)} childError={Boolean(childError)}
            memberDetails={member ? <>
                {member.roles.includes("participant") ? <DisciplineFields teamId={team.id} scope="teamMembership" personId={member.id}/> : null}
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
            </> : undefined}
          />
        </main>
      </AppShell>
    </>
  );
}

