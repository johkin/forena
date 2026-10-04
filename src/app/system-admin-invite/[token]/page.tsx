import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { systemAdminInvitationPath } from "@/lib/platform-admin-invitation-token";
import { acceptSystemAdminInvitation } from "./actions";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function SystemAdminInvitationPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { error } = await searchParams;
  const destination = systemAdminInvitationPath(token);
  if (!destination) redirect("/login?error=Inbjudan+saknar+en+giltig+länk");
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect(`/login?next=${encodeURIComponent(destination)}`);
  }

  return (<>
    <AppHeader accountEmail={data.user.email} />
    <main className="auth-page">
      <section className="auth-card">
        <span className="brand-mark">F</span>
        <p className="eyebrow">Förena · System</p>
        <h1>Systemadministratör</h1>
        <p>Du är inloggad som {data.user.email}. Bekräfta inbjudan för att aktivera systemadministration.</p>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <form action={acceptSystemAdminInvitation} className="auth-form">
          <input name="token" type="hidden" value={token} />
          <button className="primary" type="submit">Acceptera inbjudan</button>
        </form>
      </section>
    </main>
  </>);
}
