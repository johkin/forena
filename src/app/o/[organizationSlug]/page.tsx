import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ organizationSlug: string }> };

export default async function OrganizationWorkspacePage({ params }: Props) {
  const { organizationSlug } = await params;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect(`/login?next=${encodeURIComponent(`/o/${organizationSlug}`)}`);
  const { data: organization } = await supabase.from("organizations").select("id").eq("slug", organizationSlug).maybeSingle();
  const { data: team } = organization ? await supabase.from("teams").select("slug, name").eq("organization_id", organization.id).order("name").limit(1).maybeSingle() : { data: null };
  return (
    <main className="empty-workspace">
      <span className="brand-mark">F</span>
      <p className="eyebrow">Föreningsnivå</p>
      <h1>Föreningsöversikten kommer här</h1>
      <p>Just nu prioriterar vi medlemsansökningar och det kompletta arbetsflödet för laget.</p>
      <div className="organization-actions"><Link className="primary" href={`/o/${organizationSlug}/applications`}>Hantera medlemsansökningar</Link><Link className="secondary" href={`/o/${organizationSlug}/join`}>Öppna ansökningssidan</Link>{team ? <Link className="secondary" href={`/o/${organizationSlug}/t/${team.slug}`}>Till {team.name}</Link> : null}</div>
    </main>
  );
}
