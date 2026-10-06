import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { getVerificationContext } from "@/lib/membership/verification";
import { MembershipVerificationResendForm } from "@/components/membership-verification-resend-form";
import { confirmApplicationEmail } from "./actions";

export const metadata: Metadata = {
  title: "Verifiera medlemsansökan · Förena", robots: { index: false, follow: false }, referrer: "no-referrer",
};

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> };

export default async function ApplicationVerificationPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { error } = await searchParams;
  const context = await getVerificationContext(token);
  // GET is intentionally read-only: email scanners must never verify an address.
  return <AppShell><main className="auth-page"><section className="auth-card">
    <p className="eyebrow">Medlemsansökan</p><h1>Bekräfta din e-postadress</h1>
    <p>Bekräfta för att skicka den sparade ansökan till föreningens kansli. Inget konto eller medlemskap skapas.</p>
    {error ? <p className="auth-error" role="alert">Länken är ogiltig, har gått ut eller har ersatts. Begär en ny länk nedan om ansökan fortfarande väntar på verifiering.</p> : null}
    {context ? <form action={confirmApplicationEmail} className="auth-form"><input type="hidden" name="token" value={token} />
      <button className="primary" type="submit">Verifiera och skicka till kansliet</button>
    </form> : <p>Ansökan kan redan vara verifierad eller länken ogiltig.</p>}
    {context ? <MembershipVerificationResendForm organizationSlug={context.organization_slug} applicationId={context.application_id} /> : null}
  </section></main></AppShell>;
}
