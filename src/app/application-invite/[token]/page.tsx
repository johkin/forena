import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { activateApprovedMembership } from "./actions";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> };

export default async function ApplicationInvitationPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/login?next=${encodeURIComponent(`/application-invite/${token}`)}`);

  return <main className="auth-page"><section className="auth-card"><span className="brand-mark">F</span><p className="eyebrow">Godkänd medlemsansökan</p><h1>Aktivera medlemskapet</h1><p>Du är inloggad som {data.user.email}. Bekräfta för att koppla dig som målsman och aktivera spelarens lagmedlemskap.</p>{error ? <p className="auth-error" role="alert">{error}</p> : null}<form action={activateApprovedMembership} className="auth-form"><input name="token" type="hidden" value={token} /><button className="primary" type="submit">Aktivera medlemskap</button></form></section></main>;
}
