import { MembershipVerificationResendForm } from "@/components/membership-verification-resend-form";
import { notFound } from "next/navigation";
import { MembershipApplicationForm } from "@/components/membership-application-form";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ section?: string; team?: string; sent?: string; application?: string; deliveryFailed?: string; resent?: string; error?: string }>;
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
  const { data: authData } = await supabase.auth.getUser();
  const shellProps = { logoutDestination: `/o/${organizationSlug}/join`, homeHref: `/o/${organizationSlug}`, accountEmail: authData.user?.email, loginHref: `/login?next=${encodeURIComponent(`/o/${organizationSlug}/join`)}` };

  if (query.sent === "1") {
    return <AppShell {...shellProps}><main className="application-page"><section className="application-card application-confirmation"><span className="brand-mark">F</span><p className="eyebrow">Ansökan mottagen</p><h1>Tack för din ansökan</h1><p>Kansliet granskar uppgifterna. Om ansökan godkänns skickas en personlig aktiveringslänk till målsmännen.</p></section></main></AppShell>;
  }

  if (query.sent === "verify") {
    return <AppShell {...shellProps}><main className="application-page"><section className="application-card application-confirmation">
      <p className="eyebrow">Inväntar e-postverifiering</p><h1>Bekräfta din e-postadress</h1>
      <p>Ansökan är sparad. Öppna mejlet till målsman 1 och bekräfta adressen inom 24 timmar. Därefter visas ansökan för kansliet. Inget konto eller medlemskap skapas ännu.</p>
      {query.deliveryFailed === "1" ? <p className="auth-error" role="alert">Mejlet kunde inte skickas. Du kan begära en ny länk nedan utan att fylla i ansökan igen.</p> : null}
      {query.resent === "1" ? <p role="status">Om uppgifterna stämmer och utskicksgränsen tillåter det skickas en ny länk. Kontrollera även skräpposten.</p> : null}
      <p className="form-help">Du kan begära en ny länk efter en minut, högst tre gånger per timme totalt över alla föreningar. Vid många samtidiga ansökningar kan du behöva försöka senare. En ny länk ersätter den tidigare.</p>
      <MembershipVerificationResendForm organizationSlug={organizationSlug} applicationId={query.application ?? ""} />
    </section></main></AppShell>;
  }

  const options = data.map((item) => ({ organizationId: item.organization_id, sectionId: item.section_id, sectionName: item.section_name, sectionSlug: item.section_slug, teamId: item.team_id, teamName: item.team_name, teamSlug: item.team_slug }));
  return (<AppShell {...shellProps}>
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
  </AppShell>);
}
