import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updatePlayer } from "./actions";

type Props = {
  params: Promise<{ organizationSlug: string; teamSlug: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
};

export default async function TeamMembersPage({ params, searchParams }: Props) {
  const { organizationSlug, teamSlug } = await params;
  const { error, saved } = await searchParams;
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

  const { data: memberships } = await supabase.from("memberships").select("person_id").eq("team_id", team.id).eq("role", "participant").is("ends_on", null);
  const personIds = (memberships ?? []).map((item) => item.person_id);
  const [{ data: people }, { data: loginEmails }] = await Promise.all([
    personIds.length ? supabase.from("people").select("id, display_name, user_id").in("id", personIds).order("display_name") : Promise.resolve({ data: [] }),
    personIds.length ? supabase.from("person_login_emails").select("person_id, email").in("person_id", personIds) : Promise.resolve({ data: [] }),
  ]);
  const emailByPerson = new Map((loginEmails ?? []).map((item) => [item.person_id, item.email]));

  return (
    <main className="application-page">
      <section className="application-card members-admin-card">
        <div className="application-page-heading">
          <div><p className="eyebrow">{organization.name} · {team.name}</p><h1>Spelare</h1><p>Uppdatera spelaruppgifter och lägg till e-post för den som ska kunna logga in själv.</p></div>
          <Link className="secondary" href={`/o/${organizationSlug}/t/${teamSlug}`}>Till översikten</Link>
        </div>
        {saved ? <div className="auth-message">{saved} har uppdaterats.</div> : null}
        {error ? <div className="auth-error">{error}</div> : null}
        <div className="member-admin-list">
          {(people ?? []).map((person) => (
            <form action={updatePlayer} className="member-admin-row" key={person.id}>
              <input name="organizationSlug" type="hidden" value={organizationSlug} />
              <input name="teamSlug" type="hidden" value={teamSlug} />
              <input name="personId" type="hidden" value={person.id} />
              <label>Namn<input name="displayName" defaultValue={person.display_name} required /></label>
              <label>E-post för egen inloggning<input name="email" type="email" defaultValue={emailByPerson.get(person.id) ?? ""} placeholder="namn+spelare@example.se" /></label>
              <div className="member-account-state"><span className={`status ${person.user_id ? "accepted" : "pending"}`}>{person.user_id ? "Konto kopplat" : "Inte aktiverat"}</span><button className="primary" type="submit">Spara</button></div>
            </form>
          ))}
        </div>
        <p className="form-help member-admin-help">När adressen sparats kan spelaren välja ”Skapa ett konto med lösenord” på inloggningssidan. Med e-postverifiering aktiverad behöver adressen verifieras en gång; därefter fungerar lösenord direkt.</p>
      </section>
    </main>
  );
}
