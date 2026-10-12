import { ClubAdministrators } from "@/components/club-administrators";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ClubAdministration, loadClubAdministration } from "@/components/club-administration";
export default async function ClubPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string; created?: string; deleted?: string; adminMessage?: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const { structure, disciplines } = await loadClubAdministration(id);
  const query = await searchParams;
  return <main className="application-page"><div className="application-card"><p className="eyebrow">System · Klubb</p><h1>{structure.organization.name}</h1><a href={`/o/${structure.organization.slug}`}>Visa klubbens översikt</a>{query.error ? <p className="auth-error" role="alert">{query.error}</p> : null}{query.saved || query.created || query.deleted ? <p className="auth-message">{query.created ? "Klubben och första sektionen har skapats." : query.deleted ? "Sektionen har tagits bort." : "Sparat."}</p> : null}{query.adminMessage ? <p className="auth-message" role="status">{query.adminMessage}</p> : null}<ClubAdministrators organizationId={id}/><ClubAdministration structure={structure} disciplines={disciplines} system/></div></main>;
}
