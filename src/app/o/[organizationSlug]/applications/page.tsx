import Link from "next/link";
import { redirect } from "next/navigation";
import { ApplicationReviewList } from "@/components/application-review-list";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ organizationSlug: string }> };

export default async function ApplicationsPage({ params }: Props) {
  const { organizationSlug } = await params;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect(`/login?next=${encodeURIComponent(`/o/${organizationSlug}/applications`)}`);
  const { data: organization } = await supabase.from("organizations").select("id, name").eq("slug", organizationSlug).maybeSingle();
  if (!organization) redirect("/setup");

  const [{ data: applications }, { data: sections }, { data: teams }] = await Promise.all([
    supabase.from("membership_applications").select("id, section_id, team_id, player_first_name, player_last_name, player_birth_date, previous_club, message, review_status, activation_status").eq("organization_id", organization.id).order("created_at", { ascending: false }),
    supabase.from("sections").select("id, name").eq("organization_id", organization.id),
    supabase.from("teams").select("id, name").eq("organization_id", organization.id),
  ]);
  const applicationIds = (applications ?? []).map((item) => item.id);
  const { data: guardians } = applicationIds.length ? await supabase.from("membership_application_guardians").select("application_id, first_name, last_name, email, mobile").in("application_id", applicationIds).order("position") : { data: [] };
  const sectionById = new Map((sections ?? []).map((item) => [item.id, item.name]));
  const teamById = new Map((teams ?? []).map((item) => [item.id, item.name]));
  const items = (applications ?? []).map((item) => ({
    id: item.id, playerName: `${item.player_first_name} ${item.player_last_name}`, birthDate: item.player_birth_date,
    sectionName: sectionById.get(item.section_id) ?? "Sektion", teamName: teamById.get(item.team_id) ?? "Lag",
    guardians: (guardians ?? []).filter((guardian) => guardian.application_id === item.id).map((guardian) => ({ name: `${guardian.first_name} ${guardian.last_name}`, email: guardian.email, mobile: guardian.mobile })),
    previousClub: item.previous_club, message: item.message, reviewStatus: item.review_status as "submitted" | "approved" | "rejected", activationStatus: item.activation_status,
  }));

  return <main className="application-page"><section className="application-card review-card"><div className="application-page-heading"><div><p className="eyebrow">{organization.name} · Kansliet</p><h1>Medlemsansökningar</h1><p>Godkänn eller avslå ansökningar. Aktiveringslänkar skickas först efter godkännande.</p></div><Link className="secondary" href={`/o/${organizationSlug}`}>Till översikten</Link></div><ApplicationReviewList initialApplications={items} /></section></main>;
}
