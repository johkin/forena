import { notFound } from "next/navigation";
import { MembershipApplicationForm } from "@/components/membership-application-form";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ section?: string; team?: string; sent?: string; error?: string }>;
};

export default async function JoinPage({ params, searchParams }: Props) {
  const { organizationSlug } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_join_options", { requested_organization_slug: organizationSlug });
  if (error) {
    console.error("[membership-application] join options failed", {
      organizationSlug,
      code: error.code,
      message: error.message,
    });
    throw new Error("Medlemsansökan kunde inte laddas.");
  }
  if (!data?.length) notFound();

  if (query.sent === "1") {
    return <main className="application-page"><section className="application-card application-confirmation"><span className="brand-mark">F</span><p className="eyebrow">Ansökan mottagen</p><h1>Tack för din ansökan</h1><p>Kansliet granskar uppgifterna. Om ansökan godkänns skickas en personlig aktiveringslänk till målsmännen.</p></section></main>;
  }

  const options = data.map((item) => ({ organizationId: item.organization_id, sectionId: item.section_id, sectionName: item.section_name, sectionSlug: item.section_slug, teamId: item.team_id, teamName: item.team_name, teamSlug: item.team_slug }));
  return (
    <main className="application-page">
      <section className="application-card">
        <span className="brand-mark">F</span>
        <p className="eyebrow">{data[0].organization_name}</p>
        <h1>Ansök om medlemskap</h1>
        <p>Välj verksamhet och fyll i spelarens och målsmännens uppgifter.</p>
        {query.error ? <p className="auth-error" role="alert">{query.error}</p> : null}
        <MembershipApplicationForm organizationSlug={organizationSlug} options={options} selectedSection={query.section} selectedTeam={query.team} />
      </section>
    </main>
  );
}
