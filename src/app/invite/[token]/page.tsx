import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { acceptTeamInvitation } from "./actions";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function TeamInvitationPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);

  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="brand-mark">F</span>
        <p className="eyebrow">Laginbjudan</p>
        <h1>Gå med i laget</h1>
        <p>Du är inloggad som {data.user.email}. Bekräfta för att koppla kontot till laget.</p>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <form action={acceptTeamInvitation} className="auth-form">
          <input name="token" type="hidden" value={token} />
          <button className="primary" type="submit">Acceptera inbjudan</button>
        </form>
      </section>
    </main>
  );
}
