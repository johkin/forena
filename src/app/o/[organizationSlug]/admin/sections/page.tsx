import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { ClubAdministration, loadClubAdministration } from "@/components/club-administration";
export default async function SectionsPage({ params, searchParams }: { params: Promise<{ organizationSlug: string }>; searchParams: Promise<{ error?: string; saved?: string; created?: string; deleted?: string }> }) {
  const { organizationSlug } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/login?next=${encodeURIComponent(`/o/${organizationSlug}/admin/sections`)}`);
  const { data: club, error } = await supabase.from("organizations").select("id,slug,name,assistant_name,time_zone").eq("slug", organizationSlug).maybeSingle();
  if (error) throw new Error("Klubben kunde inte hämtas.");
  if (!club) notFound();
  const { data: allowed, error: accessError } = await supabase.rpc("has_organization_role", { target_organization_id: club.id, allowed_roles: ["owner","admin"] });
  if (accessError || allowed !== true) redirect(`/o/${club.slug}`);
  const { structure, disciplines } = await loadClubAdministration(club.id);
  const query = await searchParams;
  return <AppShell accountEmail={auth.user.email} organization={{id:club.id,slug:club.slug,name:club.name,assistantName:club.assistant_name,timeZone:club.time_zone}} adminHref={`/o/${club.slug}/admin/roles`}><main className="application-page"><div className="application-card"><p className="eyebrow">Klubbadministration</p><h1>Klubb och sektioner</h1>{query.error ? <p className="auth-error" role="alert">{query.error}</p> : null}{query.saved || query.created || query.deleted ? <p className="auth-message">{query.created ? "Klubben och första sektionen har skapats." : query.deleted ? "Sektionen har tagits bort." : "Sparat."}</p> : null}<ClubAdministration structure={structure} disciplines={disciplines}/></div></main></AppShell>;
}
