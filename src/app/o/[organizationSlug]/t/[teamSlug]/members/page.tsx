import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TeamMenu } from "@/components/team-menu";
import { createTeamGroup, deleteTeamGroup, sendPlayerInvitation, updatePlayer, updateTeamGroup } from "./actions";

type Props = {
  params: Promise<{ organizationSlug: string; teamSlug: string }>;
  searchParams: Promise<{ error?: string; saved?: string; invited?: string; groupSaved?: string; groupDeleted?: string }>;
};

export default async function TeamMembersPage({ params, searchParams }: Props) {
  const { organizationSlug, teamSlug } = await params;
  const { error, saved, invited, groupSaved, groupDeleted } = await searchParams;
  const destination = `/o/${organizationSlug}/t/${teamSlug}/members`;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect(`/login?next=${encodeURIComponent(destination)}`);

  const { data: organization } = await supabase.from("organizations").select("id, name").eq("slug", organizationSlug).maybeSingle();
  const { data: team } = organization
    ? await supabase.from("teams").select("id, name").eq("organization_id", organization.id).eq("slug", teamSlug).maybeSingle()
    : { data: null };
  if (!organization || !team) redirect("/setup");

  const { data: canManage } = await supabase.rpc("can_manage_team", { target_team_id: team.id });
  if (!canManage) redirect(`/o/${organizationSlug}/t/${teamSlug}`);

  const { data: memberships } = await supabase.from("memberships").select("person_id, role").eq("team_id", team.id).in("role", ["participant", "leader"]).is("ends_on", null);
  const personIds = [...new Set((memberships ?? []).map((item) => item.person_id))];
  const roleByPerson = new Map((memberships ?? []).map((item) => [item.person_id, item.role]));
  const [{ data: people }, { data: loginEmails }, { data: groups }, { data: groupMembers }] = await Promise.all([
    personIds.length ? supabase.from("people").select("id, display_name, user_id").in("id", personIds).order("display_name") : Promise.resolve({ data: [] }),
    personIds.length ? supabase.from("person_login_emails").select("person_id, email").in("person_id", personIds) : Promise.resolve({ data: [] }),
    supabase.from("team_groups").select("id, name").eq("team_id", team.id).order("name"),
    supabase.from("team_group_members").select("group_id, person_id").eq("organization_id", organization.id),
  ]);
  const groupPersonIds = new Map<string, Set<string>>();
  for (const item of groupMembers ?? []) { const ids = groupPersonIds.get(item.group_id) ?? new Set<string>(); ids.add(item.person_id); groupPersonIds.set(item.group_id, ids); }
  const emailByPerson = new Map((loginEmails ?? []).map((item) => [item.person_id, item.email]));

  return (
    <main>
      <header className="topbar">
        <div className="topbar-brand-row">
          <TeamMenu organizationSlug={organizationSlug} teamSlug={teamSlug} teamName={team.name} canManageTeam={Boolean(canManage)} leaderView activeItem="members" />
          <a className="brand" href={`/o/${organizationSlug}/t/${teamSlug}`} aria-label="Förena startsida"><span className="brand-mark">F</span><span>Förena</span></a>
        </div>
      </header>
      <div className="shell">
        <TeamMenu organizationSlug={organizationSlug} teamSlug={teamSlug} teamName={team.name} canManageTeam={Boolean(canManage)} leaderView activeItem="members" />
        <section className="content">
          <section className="application-card members-admin-card">
        <div className="application-page-heading">
          <div><p className="eyebrow">{organization.name} · {team.name}</p><h1>Trupp och grupper</h1><p>Hantera spelare, ledare och undergrupper som kan användas som målgrupper för kallelser.</p></div>
        </div>
        {saved ? <div className="auth-message">{saved} har uppdaterats.</div> : null}
        {invited ? <div className="auth-message">Inbjudan har skickats till {invited}.</div> : null}
        {groupSaved ? <div className="auth-message">Gruppen {groupSaved} har sparats.</div> : null}
        {groupDeleted ? <div className="auth-message">Gruppen {groupDeleted} har tagits bort.</div> : null}
        {error ? <div className="auth-error">{error}</div> : null}
        <div className="application-page-heading"><div><p className="eyebrow">Kallelser</p><h2>Undergrupper</h2><p>En grupp kan innehålla både spelare och ledare. Medlemskapet läses när en schemalagd kallelse skickas.</p></div></div>
        <form action={createTeamGroup} className="member-admin-row">
          <input name="organizationSlug" type="hidden" value={organizationSlug} /><input name="teamSlug" type="hidden" value={teamSlug} />
          <label>Namn på ny grupp<input name="name" required maxLength={80} placeholder="Till exempel Matchtrupp" /></label><div className="member-account-state"><button className="primary" type="submit">Skapa grupp</button></div>
        </form>
        <div className="member-admin-list">
          {(groups ?? []).map((group) => <form action={updateTeamGroup} className="member-admin-row" key={group.id}>
            <input name="organizationSlug" type="hidden" value={organizationSlug} /><input name="teamSlug" type="hidden" value={teamSlug} /><input name="groupId" type="hidden" value={group.id} />
            <label>Gruppnamn<input name="name" defaultValue={group.name} required maxLength={80} /></label>
            <fieldset><legend>Medlemmar</legend><div className="member-options">{(people ?? []).map((person) => <label key={person.id}><input type="checkbox" name="personIds" value={person.id} defaultChecked={groupPersonIds.get(group.id)?.has(person.id) ?? false} /><span className="member-avatar">{person.display_name.slice(0,1)}</span>{person.display_name} <small>{roleByPerson.get(person.id)==="leader"?"Ledare":"Spelare"}</small></label>)}</div></fieldset>
            <div className="member-account-state"><div className="member-admin-actions"><button className="secondary" formAction={deleteTeamGroup} type="submit">Ta bort</button><button className="primary" type="submit">Spara grupp</button></div></div>
          </form>)}
        </div>
        <div className="application-page-heading"><div><p className="eyebrow">Trupp</p><h2>Spelare</h2><p>Uppdatera spelaruppgifter och lägg till e-post för den som ska kunna logga in själv.</p></div></div>
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
