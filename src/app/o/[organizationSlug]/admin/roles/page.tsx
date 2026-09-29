import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { assignGuardianRole } from "./actions";

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

  const [{ data: guardianLinks }, { data: teams }, { data: staff }] = await Promise.all([
    supabase.from("person_guardians").select("guardian_user_id").eq("organization_id", organization.id),
    supabase.from("teams").select("id, slug, name").eq("organization_id", organization.id).order("name"),
    supabase.from("team_staff").select("team_id, user_id, role").eq("organization_id", organization.id),
  ]);
  const userIds = [...new Set((guardianLinks ?? []).map((item) => item.guardian_user_id))];
  const [{ data: people }, { data: members }] = await Promise.all([
    userIds.length ? supabase.from("people").select("user_id, display_name").eq("organization_id", organization.id).in("user_id", userIds) : Promise.resolve({ data: [] }),
    userIds.length ? supabase.from("organization_members").select("user_id").eq("organization_id", organization.id).in("user_id", userIds) : Promise.resolve({ data: [] }),
  ]);
  const memberIds = new Set((members ?? []).map((member) => member.user_id));
  const guardians = (people ?? []).filter((person) => person.user_id && memberIds.has(person.user_id))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "sv"));
  const guardianNames = new Map(guardians.map((person) => [person.user_id, person.display_name]));
  const teamNames = new Map((teams ?? []).map((team) => [team.id, team.name]));
  const assignments = (staff ?? []).filter((item) => guardianNames.has(item.user_id) && ["team_manager", "coach"].includes(item.role));

  return <>
    <AppHeader homeHref={`/o/${organizationSlug}`} accountEmail={authData.user.email}
      organization={{ ...organization, assistantName: organization.assistant_name }} logoutDestination={`/o/${organizationSlug}`}
      workspaces={[{ id: organization.id, kind: "organization", name: organization.name, description: "Förening", href: `/o/${organizationSlug}`, active: true }, ...(teams ?? []).map((team) => ({ id: team.id, kind: "team" as const, name: team.name, description: "Lag", href: `/o/${organizationSlug}/t/${team.slug}`, active: false }))]}
      adminHref={destination} />
    <main className="application-page"><div className="application-card review-card">
      <div className="application-page-heading"><div><p className="eyebrow">{organization.name} · Administration</p><h1>Ledare och roller</h1><p>Ge en befintlig målsman en ledarroll i ett lag. Målsmannens koppling till sitt barn finns kvar.</p></div></div>
      {saved ? <p className="auth-message" role="status">Rollen har sparats.</p> : null}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <form action={assignGuardianRole} className="application-form">
        <input name="organizationSlug" type="hidden" value={organizationSlug} />
        <div className="form-section"><h2>Tilldela lagroll</h2>
          <label>Målsman<select name="userId" required defaultValue=""><option value="" disabled>Välj målsman</option>{guardians.map((person) => <option key={person.user_id} value={person.user_id ?? ""}>{person.display_name}</option>)}</select></label>
          <label>Lag<select name="teamId" required defaultValue=""><option value="" disabled>Välj lag</option>{(teams ?? []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
          <label>Roll<select name="role" required defaultValue="coach"><option value="coach">Tränare</option><option value="team_manager">Lagledare</option></select></label>
          <p className="form-help">Båda rollerna kan administrera laget. Tilldelningen visas också som ledare i lagets trupp.</p>
          <button className="primary application-submit" disabled={!guardians.length || !teams?.length} type="submit">Spara roll</button>
        </div>
      </form>
      <div className="form-section club-role-list"><h2>Befintliga lagroller</h2>
        {assignments.length ? <ul>{assignments.map((item) => <li key={`${item.team_id}:${item.user_id}`}><strong>{guardianNames.get(item.user_id)}</strong><span>{teamNames.get(item.team_id)} · {item.role === "coach" ? "Tränare" : "Lagledare"}</span></li>)}</ul> : <p className="form-help">Inga målsmän har en lagroll ännu.</p>}
      </div>
    </div></main>
  </>;
}
