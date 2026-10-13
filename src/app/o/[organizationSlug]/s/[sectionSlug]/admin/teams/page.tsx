import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SectionTeamAdministration } from "@/components/section-team-administration";
import { saveSectionTeam, deleteSectionTeam } from "@/app/section-team-administration-actions";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { sectionTeamStructureSchema } from "@/lib/section-team-administration";

export default async function SectionTeamsPage({ params, searchParams }: {
  params: Promise<{ organizationSlug: string; sectionSlug: string }>;
  searchParams: Promise<{ error?: string; created?: string; saved?: string; deleted?: string }>;
}) {
  const { organizationSlug, sectionSlug } = await params;
  const path = `/o/${organizationSlug}/s/${sectionSlug}/admin/teams`;
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) redirect(`/login?next=${encodeURIComponent(path)}`);
  // Public IDs resolve the route for system admins without granting membership.
  const publicClient = createPublicClient();
  const { data: club, error: clubError } = await publicClient.from("organizations").select("id").eq("slug", organizationSlug).maybeSingle();
  if (clubError) throw new Error("Klubben kunde inte hämtas.");
  if (!club) notFound();
  const { data: section, error: sectionError } = await publicClient.from("sections").select("id").eq("organization_id", club.id).eq("slug", sectionSlug).maybeSingle();
  if (sectionError) throw new Error("Sektionen kunde inte hämtas.");
  if (!section) notFound();
  const { data, error } = await supabase.rpc("section_team_structure", { target: club.id, section_id: section.id });
  if (error?.code === "42501") redirect(`/o/${organizationSlug}/s/${sectionSlug}`);
  if (error?.code === "P0002") notFound();
  if (error) throw new Error("Sektionens lagadministration kunde inte hämtas.");
  const structure = sectionTeamStructureSchema.parse(data);
  const query = await searchParams;
  return <AppShell homeHref={`/o/${organizationSlug}`} accountEmail={auth.user.email} organization={structure.organization}
    navigation={<nav><a href={`/o/${organizationSlug}/s/${sectionSlug}`}>Sektionens översikt</a></nav>}>
    <main className="application-page"><div className="application-card">
      <p className="eyebrow">{structure.organization.name} · {structure.section.name}</p><h1>Hantera lag</h1>
      <a className="secondary" href={`/o/${organizationSlug}/s/${sectionSlug}`}>Till sektionens översikt</a>
      {query.error ? <p className="auth-error" role="alert">{query.error}</p> : null}
      {query.created || query.saved || query.deleted ? <p className="auth-message" role="status">{query.created ? "Laget har lagts till." : query.deleted ? "Laget har tagits bort." : "Laget har sparats."}</p> : null}
      <SectionTeamAdministration structure={structure} saveAction={saveSectionTeam} deleteAction={deleteSectionTeam}/>
    </div></main>
  </AppShell>;
}
