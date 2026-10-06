import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { assignGuardianAccess } from "./actions";

type Props = {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function ClubRolesPage({ params, searchParams }: Props) {
  const { organizationSlug } = await params;
  const { saved, error } = await searchParams;
  const destination = `/o/${organizationSlug}/admin/roles`;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect(`/login?next=${encodeURIComponent(destination)}`);

  const { data: organization } = await supabase.from("organizations")
    .select("id, slug, name, assistant_name").eq("slug", organizationSlug).maybeSingle();
  if (!organization) redirect("/setup");
  const { data: isAdmin } = await supabase.rpc("has_organization_role", {
    target_organization_id: organization.id, allowed_roles: ["owner", "admin"],
  });
  if (!isAdmin) redirect(`/o/${organizationSlug}`);

  const [{ data: guardianLinks }, { data: teams }, { data: accessProfiles }, { data: responsibilityTypes }] = await Promise.all([
    supabase.from("person_guardians").select("guardian_user_id").eq("organization_id", organization.id),
    supabase.from("teams").select("id, slug, name").eq("organization_id", organization.id).order("name"),
    supabase.from("team_access_profiles").select("id, key, name").eq("organization_id", organization.id).order("name"),
    supabase.from("responsibility_types").select("id, slug, name").eq("organization_id", organization.id).in("slug", ["lagledare", "tranare"]).order("name"),
  ]);
  const userIds = [...new Set((guardianLinks ?? []).map((item) => item.guardian_user_id))];
  const [{ data: people }, { data: members }] = await Promise.all([
    userIds.length ? supabase.from("people").select("id, user_id, display_name").eq("organization_id", organization.id).in("user_id", userIds) : Promise.resolve({ data: [] }),
    userIds.length ? supabase.from("organization_members").select("user_id").eq("organization_id", organization.id).in("user_id", userIds) : Promise.resolve({ data: [] }),
  ]);
  const memberIds = new Set((members ?? []).map((member) => member.user_id));
  const guardians = (people ?? []).filter((person) => person.user_id && memberIds.has(person.user_id))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "sv"));
  const guardianNamesByPersonId = new Map(guardians.map((person) => [person.id, person.display_name]));
  const guardianPersonIds = guardians.map((person) => person.id);
  const teamNames = new Map((teams ?? []).map((team) => [team.id, team.name]));
  const profileNames = new Map((accessProfiles ?? []).map((profile) => [profile.id, profile.name]));
  const responsibilityNames = new Map((responsibilityTypes ?? []).map((responsibility) => [responsibility.id, responsibility.name]));
  const [{ data: accessAssignments }, { data: responsibilityAssignments }] = guardianPersonIds.length
    ? await Promise.all([
        supabase.from("team_access_assignments").select("team_id, person_id, access_profile_id").eq("organization_id", organization.id).in("person_id", guardianPersonIds).is("ends_on", null),
        supabase.from("team_responsibilities").select("team_id, person_id, responsibility_type_id").eq("organization_id", organization.id).in("person_id", guardianPersonIds).is("ends_on", null),
      ])
    : [{ data: [] }, { data: [] }];
  const responsibilitiesByPersonTeam = new Map<string, string[]>();
  for (const assignment of responsibilityAssignments ?? []) {
    const name = responsibilityNames.get(assignment.responsibility_type_id);
    if (!name) continue;
    const key = `${assignment.person_id}:${assignment.team_id}`;
    responsibilitiesByPersonTeam.set(key, [...(responsibilitiesByPersonTeam.get(key) ?? []), name]);
  }

  return <AppShell homeHref={`/o/${organizationSlug}`} accountEmail={authData.user.email}
      organization={{ ...organization, assistantName: organization.assistant_name }} logoutDestination={`/o/${organizationSlug}`}
      workspaces={[{ id: organization.id, kind: "organization", name: organization.name, description: "Förening", href: `/o/${organizationSlug}`, active: true }, ...(teams ?? []).map((team) => ({ id: team.id, kind: "team" as const, name: team.name, description: "Lag", href: `/o/${organizationSlug}/t/${team.slug}`, active: false }))]}
      adminHref={destination}>
    <main className="application-page"><div className="application-card review-card">
      <div className="application-page-heading"><div><p className="eyebrow">{organization.name} · Administration</p><h1>Ledare, ansvar och behörighet</h1><p>Lagrelation, ansvar och systembehörighet hanteras separat. En person kan vara ledare och till exempel tränare utan att automatiskt få full lagadministration.</p></div></div>
      {saved ? <p className="auth-message" role="status">Ansvar och behörighet har sparats.</p> : null}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <form action={assignGuardianAccess} className="application-form">
        <input name="organizationSlug" type="hidden" value={organizationSlug} />
        <div className="form-section"><h2>Tilldela ansvar och behörighet</h2>
          <label>Målsman<select name="userId" required defaultValue=""><option value="" disabled>Välj målsman</option>{guardians.map((person) => <option key={person.user_id} value={person.user_id ?? ""}>{person.display_name}</option>)}</select></label>
          <label>Lag<select name="teamId" required defaultValue=""><option value="" disabled>Välj lag</option>{(teams ?? []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
          <label>Ansvar<select name="responsibility" required defaultValue="tranare">{(responsibilityTypes ?? []).map((responsibility) => <option key={responsibility.id} value={responsibility.slug}>{responsibility.name}</option>)}</select></label>
          <label>Behörighet<select name="accessProfile" required defaultValue="team_admin">{(accessProfiles ?? []).map((profile) => <option key={profile.id} value={profile.key}>{profile.name}</option>)}</select></label>
          <p className="form-help">Ansvar beskriver personens funktion i laget. Behörighet styr separat vad personen får göra i systemet.</p>
          <button className="primary application-submit" disabled={!guardians.length || !teams?.length} type="submit">Spara</button>
        </div>
      </form>
      <div className="form-section club-role-list"><h2>Befintliga tilldelningar</h2>
        {(accessAssignments ?? []).length ? <ul>{(accessAssignments ?? []).map((item) => {
          const responsibilities = responsibilitiesByPersonTeam.get(`${item.person_id}:${item.team_id}`) ?? [];
          return <li key={`${item.team_id}:${item.person_id}:${item.access_profile_id}`}><strong>{guardianNamesByPersonId.get(item.person_id)}</strong><span>{teamNames.get(item.team_id)} · {responsibilities.join(" · ") || "Ledare"} · {profileNames.get(item.access_profile_id) ?? "Behörighet"}</span></li>;
        })}</ul> : <p className="form-help">Inga målsmän har en lagbehörighet ännu.</p>}
      </div>
    </div></main>
  </AppShell>;
}
