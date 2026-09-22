import { redirect } from "next/navigation";
import { PasskeyEnrollment } from "@/components/passkey-enrollment";
import { createClient } from "@/lib/supabase/server";

export default async function PasskeySetupPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) redirect("/login");

  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="brand-mark">F</span>
        <p className="eyebrow">Snabbare inloggning</p>
        <h1>Skapa en passkey</h1>
        <p>
          Använd Face ID, Touch ID, enhetens PIN-kod eller din lösenordshanterare nästa gång du loggar in.
        </p>
        <PasskeyEnrollment />
      </section>
    </main>
  );
}
