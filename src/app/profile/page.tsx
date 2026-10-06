import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { updateProfile } from "./actions";

type Props = { searchParams: Promise<{ saved?: string; error?: string }> };

export default async function ProfilePage({ searchParams }: Props) {
  const { saved, error } = await searchParams;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login?next=%2Fprofile");

  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", authData.user.id).maybeSingle();
  const { data: people } = await supabase.from("people").select("organization_id").eq("user_id", authData.user.id);
  const organizationIds = [...new Set((people ?? []).map((person) => person.organization_id))];
  const { data: organizations } = organizationIds.length
    ? await supabase.from("organizations").select("id, name, slug").in("id", organizationIds).order("name")
    : { data: [] };

  return (
    <AppShell homeHref={organizations?.[0] ? `/o/${organizations[0].slug}` : "/"} accountEmail={authData.user.email} logoutDestination="/"
        organization={organizations?.[0] ? { ...organizations[0], assistantName: "" } : undefined}
        workspaces={(organizations ?? []).map((item) => ({ id: item.id, kind: "organization", name: item.name, description: "Förening", href: `/o/${item.slug}`, active: false }))}>
      <main className="application-page profile-page"><section className="application-card profile-card">
        <div className="application-page-heading">
          <div><p className="eyebrow">Konto</p><h1>Min profil</h1><p>Uppgifterna används när du visas som medlem eller ledare i en förening.</p></div>
          <a className="secondary" href={organizations?.[0] ? `/o/${organizations[0].slug}` : "/"}>Tillbaka</a>
        </div>
        {saved ? <div className="auth-message">Profilen har sparats.</div> : null}
        {error ? <div className="auth-error">{error}</div> : null}
        <form action={updateProfile} className="application-form">
          <div className="form-section">
            <h2>Personuppgifter</h2>
            <label>Visningsnamn<input name="displayName" required maxLength={120} defaultValue={profile?.display_name ?? ""} autoComplete="name" /></label>
            <label>E-postadress<input value={authData.user.email ?? ""} readOnly aria-readonly="true" /></label>
            <p className="form-help">E-postadressen hör till ditt inloggningskonto och kan inte ändras här ännu.</p>
          </div>
          {organizations?.length ? <div className="form-section"><h2>Föreningar</h2><div className="profile-organizations">{organizations.map((organization) => <a key={organization.id} href={`/o/${organization.slug}`}>{organization.name}<span>›</span></a>)}</div></div> : null}
          <div className="form-section"><h2>Integrationer</h2><div className="profile-organizations"><a href="/connect">Anslut AI<span aria-hidden="true">›</span></a></div><p className="form-help">Anslutningsinstruktioner och serveradress för AI-tjänster som stöder MCP.</p></div>
          <button className="primary application-submit" type="submit">Spara profil</button>
        </form>
      </section></main>
    </AppShell>
  );
}
