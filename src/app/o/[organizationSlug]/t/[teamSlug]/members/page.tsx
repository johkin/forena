import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TeamMenu } from "@/components/team-menu";
import { AppHeader } from "@/components/app-header";
import { createTeamGroup, deleteTeamGroup, sendPlayerInvitation, updatePlayer, updateTeamGroup } from "./actions";

type Props = {
  params: Promise<{ organizationSlug: string; teamSlug: string }>;
  searchParams: Promise<{ error?: string; saved?: string; leaderSaved?: string; invited?: string; groupSaved?: string; groupDeleted?: string }>;
};

export default async function TeamMembersPage({ params, searchParams }: Props) {
  const { organizationSlug, teamSlug } = await params;
  const { error, saved, leaderSaved, invited, groupSaved, groupDeleted } = await searchParams;
  const destination = `/o/${organizationSlug}/t/${teamSlug}/members`;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect(`/login?next=${encodeURIComponent(destination)}`);

  const { data: organization } = await supabase.from("organizations").select("id, name, slug, assistant_name").eq("slug", organizationSlug).maybeSingle();
  const { data: team } = organization
    ? await supabase.from("teams").select("id, name, slug, organization_id, section_id, season").eq("organization_id", organization.id).eq("slug", teamSlug).maybeSingle()
    : { data: null };
  if (!organization || !team) redirect("/setup");

  const { data: canManage } = await supabase.rpc("can_manage_team", { target_team_id: team.id });
  if (!canManage) redirect(`/o/${organizationSlug}/t/${teamSlug}`);
  const { data: isAdmin } = await supabase.rpc("has_organization_role", { target_organization_id: organization.id, allowed_roles: ["owner", "admin"] });

  const { data: accessibleTeams } = await supabase.from("teams").select("id, name, slug").eq("organization_id", organization.id).order("name");
  const workspaces = [
    { id: organization.id, kind: "organization" as const, name: organization.name, description: "Förening", href: `/o/${organizationSlug}`, active: false },
    ...(accessibleTeams ?? []).map((item) => ({ id: item.id, kind: "team" as const, name: item.name, description: "Lag", href: `/o/${organizationSlug}/t/${item.slug}`, active: item.id === team.id })),
  ];

  const { data: memberships } = await supabase.from("memberships").select("person_id, role").eq("team_id", team.id).in("role", ["participant", "leader"]).is("ends_on", null);
  const personIds = [...new Set((memberships ?? []).map((item) => item.person_id))];
  const roleByPerson = new Map((memberships ?? []).map((item) => [item.person_id, item.role]));
  const roleLabel = (role: string | undefined) => role === "participant" ? "Spelare" : role === "leader" ? "Ledare" : "Medlem";
  const [{ data: people }, { data: loginEmails }, { data: groups }, { data: groupMembers }, { data: responsibilities }] = await Promise.all([
    personIds.length ? supabase.from("people").select("id, display_name, user_id").in("id", personIds).order("display_name") : Promise.resolve({ data: [] }),
    personIds.length ? supabase.from("person_login_emails").select("person_id, email").in("person_id", personIds) : Promise.resolve({ data: [] }),
    supabase.from("team_groups").select("id, name").eq("team_id", team.id).order("name"),
    supabase.from("team_group_members").select("group_id, person_id").eq("organization_id", organization.id),
    supabase.from("team_responsibilities").select("person_id, responsibility_type_id").eq("team_id", team.id).is("ends_on", null),
  ]);
  const responsibilityTypeIds = [...new Set((responsibilities ?? []).map((item) => item.responsibility_type_id))];
  const { data: responsibilityTypes } = responsibilityTypeIds.length
    ? await supabase.from("responsibility_types").select("id, name").in("id", responsibilityTypeIds)
    : { data: [] };
  const responsibilityNameById = new Map((responsibilityTypes ?? []).map((item) => [item.id, item.name]));
  const responsibilitiesByPerson = new Map<string, string[]>();
  for (const item of responsibilities ?? []) {
    const name = responsibilityNameById.get(item.responsibility_type_id);
    if (!name) continue;
    responsibilitiesByPerson.set(item.person_id, [...(responsibilitiesByPerson.get(item.person_id) ?? []), name]);
  }
  const groupPersonIds = new Map<string, Set<string>>();
  for (const item of groupMembers ?? []) { const ids = groupPersonIds.get(item.group_id) ?? new Set<string>(); ids.add(item.person_id); groupPersonIds.set(item.group_id, ids); }
  const emailByPerson = new Map((loginEmails ?? []).map((item) => [item.person_id, item.email]));

  return (
    <main>
      <AppHeader
        homeHref={`/o/${organizationSlug}/t/${teamSlug}`}
        navigation={<TeamMenu organizationSlug={organizationSlug} teamSlug={teamSlug} teamName={team.name} canManageTeam={Boolean(canManage)} leaderView activeItem="members" navigationOnly />}
        accountEmail={authData.user.email}
        organization={{ id: organization.id, slug: organization.slug, name: organization.name, assistantName: organization.assistant_name }}
        team={{ id: team.id, slug: team.slug, name: team.name, organizationId: team.organization_id, sectionId: team.section_id, season: team.season ?? "" }}
        workspaces={workspaces}
        logoutDestination={`/o/${organizationSlug}/t/${teamSlug}`}
        adminHref={isAdmin ? `/o/${organizationSlug}/admin/roles` : undefined}
      />
      <div className="shell">
        <TeamMenu organizationSlug={organizationSlug} teamSlug={teamSlug} teamName={team.name} canManageTeam={Boolean(canManage)} leaderView activeItem="members" hideTrigger />
        <section className="content">
          <section className="application-card members-admin-card">
        <div className="application-page-heading">
          <div><p className="eyebrow">{organization.name} · {team.name}</p><h1>Truppen</h1><p>Hantera spelare, ledare och undergrupper som kan användas som målgrupper för kallelser.</p></div>
        </div>
        {saved ? <div className="auth-message">{saved} har uppdaterats.</div> : null}
        {leaderSaved ? <div className="auth-message">{leaderSaved} har uppdaterats.</div> : null}
        {invited ? <div className="auth-message">Inbjudan har skickats till {invited}.</div> : null}
        {groupSaved ? <div className="auth-message">Gruppen {groupSaved} har sparats.</div> : null}
        {groupDeleted ? <div className="auth-message">Gruppen {groupDeleted} har tagits bort.</div> : null}
        {error ? <div className="auth-error">{error}</div> : null}
        <div className="application-page-heading"><div><p className="eyebrow">Trupp</p><h2>Alla i laget</h2><p>Spelare, ledare och andra personer som är knutna till laget.</p></div></div>
        <div className="roster-sections">
          {(["participant","leader"] as const).map((role) => {
            const rolePeople = (people ?? []).filter((person) => roleByPerson.get(person.id) === role);
            if (!rolePeople.length) return null;
            return <section className="roster-section" key={role}>
              <div className="roster-section-heading"><h3>{role === "participant" ? "Spelare" : "Ledare"}</h3><span>{rolePeople.length}</span></div>
              <div className="roster-card-grid">
                {rolePeople.map((person) => <article className="roster-person-card" key={person.id}>
                  <span className="member-avatar">{person.display_name.slice(0,1)}</span>
                  <div><strong>{person.display_name}</strong><small>{role === "leader" ? (responsibilitiesByPerson.get(person.id)?.join(" · ") || "Ledare") : roleLabel(roleByPerson.get(person.id))}</small></div>
                  {person.user_id ? <span className="status accepted">Konto kopplat</span> : null}
                </article>)}
              </div>
            </section>;
          })}
        </div>
        <div className="application-page-heading group-admin-heading"><div><p className="eyebrow">Grupper</p><h2>Egna grupper</h2><p>Klubben kan sätta upp valfria grupper ovanpå truppen. En grupp kan innehålla spelare, ledare och övriga lagmedlemmar och kan användas som målgrupp för kallelser.</p></div></div>
        <form action={createTeamGroup} className="member-admin-row">
          <input name="organizationSlug" type="hidden" value={organizationSlug} /><input name="teamSlug" type="hidden" value={teamSlug} />
          <label>Namn på ny grupp<input name="name" required maxLength={80} placeholder="Till exempel Matchtrupp" /></label><div className="member-account-state"><button className="primary" type="submit">Skapa grupp</button></div>
        </form>
        <div className="member-admin-list">
          {(groups ?? []).map((group) => <form action={updateTeamGroup} className="member-admin-row" key={group.id}>
            <input name="organizationSlug" type="hidden" value={organizationSlug} /><input name="teamSlug" type="hidden" value={teamSlug} /><input name="groupId" type="hidden" value={group.id} />
            <label>Gruppnamn<input name="name" defaultValue={group.name} required maxLength={80} /></label>
            <fieldset><legend>Medlemmar</legend><div className="member-options">{(people ?? []).map((person) => <label key={person.id}><input type="checkbox" name="personIds" value={person.id} defaultChecked={groupPersonIds.get(group.id)?.has(person.id) ?? false} /><span className="member-avatar">{person.display_name.slice(0,1)}</span>{person.display_name} <small>{roleLabel(roleByPerson.get(person.id))}</small></label>)}</div></fieldset>
            <div className="member-account-state"><div className="member-admin-actions"><button className="secondary" formAction={deleteTeamGroup} type="submit">Ta bort</button><button className="primary" type="submit">Spara grupp</button></div></div>
          </form>)}
        </div>
        <div className="application-page-heading player-admin-heading"><div><p className="eyebrow">Ansvar</p><h2>Ledarnas funktioner</h2><p>Lagledare, tränare, kontaktperson och andra funktioner är ansvar som ligger separat från personens relation som ledare i laget.</p></div></div>
        <div className="application-page-heading player-admin-heading"><div><p className="eyebrow">Administration</p><h2>Spelaruppgifter</h2><p>Uppdatera spelaruppgifter och lägg till e-post för den som ska kunna logga in själv.</p></div></div>
        <div className="member-admin-list">
          {(people ?? []).filter((person) => roleByPerson.get(person.id) === "participant").map((person) => (
            <form action={updatePlayer} className="member-admin-row" key={person.id}>
              <input name="organizationSlug" type="hidden" value={organizationSlug} />
              <input name="teamSlug" type="hidden" value={teamSlug} />
              <input name="personId" type="hidden" value={person.id} />
              <label>Namn<input name="displayName" defaultValue={person.display_name} required /></label>
              <label>E-post för egen inloggning<input name="email" type="email" defaultValue={emailByPerson.get(person.id) ?? ""} placeholder="namn+spelare@example.se" readOnly={Boolean(person.user_id)} /></label>
              <div className="member-account-state"><span className={`status ${person.user_id ? "accepted" : "pending"}`}>{person.user_id ? "Konto kopplat" : "Inte aktiverat"}</span><div className="member-admin-actions"><button className="secondary" formAction={sendPlayerInvitation} type="submit">{person.user_id ? "Skicka inloggningslänk" : "Skicka inbjudan"}</button><button className="primary" type="submit">Spara</button></div></div>
            </form>
          ))}
        </div>
        <p className="form-help member-admin-help">En ny e-postadress får automatiskt en inbjudan. Länken verifierar adressen, kopplar kontot till spelaren och erbjuder en passkey. Lösenord finns kvar som ett valfritt alternativ.</p>
          </section>
        </section>
      </div>
    </main>
  );
}
