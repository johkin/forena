import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ClubOnboarding } from "@/components/club-onboarding";
import { createManagedClub } from "@/app/club-administration-actions";
import { invalidClubIdMessage } from "@/lib/club-administration";
export default async function ClubsPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; error?: string }> }) {
  const query = await searchParams;
  const page = Math.max(1, Math.min(10000, Number.parseInt(query.page ?? "1", 10) || 1));
  const q = (query.q ?? "").trim().slice(0, 120);
  const supabase = await createClient();
  let request = supabase.from("organizations").select("id,name,slug", { count: "exact" }).order("name").order("id");
  if (q) request = request.ilike("name", `%${q.replace(/[%_\\]/g, "\\$&")}%`);
  const [clubs, catalogue] = await Promise.all([request.range((page - 1) * 30, page * 30 - 1), supabase.from("disciplines").select("id,name").order("name")]);
  if (clubs.error || catalogue.error) throw new Error("Klubbarna kunde inte hämtas.");
  const link = (p: number) => `/system/organizations?${new URLSearchParams({ page: String(p), ...(q ? { q } : {}) })}`;
  return <main className="application-page"><div className="application-card"><p className="eyebrow">System</p><h1>Klubbar</h1>{query.error === "invalid-club-id" ? <p role="alert" className="auth-error">{invalidClubIdMessage}</p> : null}<p>Hantera klubbarnas uppgifter och sektioner.</p><form className="club-search" method="get"><label>Sök klubb<input name="q" defaultValue={q} maxLength={120}/></label><button className="secondary">Sök</button></form><div className="system-admin-grid">{clubs.data?.map(club => <Link key={club.id} href={`/system/organizations/${club.id}`}><strong>{club.name}</strong><span>/o/{club.slug}</span></Link>)}</div>{!clubs.data?.length ? <p>Inga klubbar matchar sökningen.</p> : null}<nav className="modal-actions" aria-label="Sidor med klubbar">{page > 1 ? <Link className="secondary" href={link(page - 1)}>Föregående</Link> : null}{page * 30 < (clubs.count ?? 0) ? <Link className="secondary" href={link(page + 1)}>Nästa</Link> : null}</nav><details className="club-admin-add"><summary>Skapa klubb</summary><ClubOnboarding disciplines={catalogue.data ?? []} managed action={createManagedClub}/></details></div></main>;
}
