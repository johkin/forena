import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requestMagicLink } from "./actions";

type Props = {
  searchParams: Promise<{ error?: string; sent?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { error, sent } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (data.user) redirect("/setup");

  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="brand-mark">F</span>
        <p className="eyebrow">Förena</p>
        <h1>Logga in</h1>
        <p>Vi skickar en säker engångslänk till din e-postadress.</p>

        {sent === "1" ? (
          <div className="auth-message success">
            Kontrollera din inkorg och öppna länken för att fortsätta.
          </div>
        ) : (
          <form action={requestMagicLink} className="auth-form">
            <label htmlFor="email">E-postadress</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
            {error ? <p className="auth-error">{error}</p> : null}
            <button className="primary" type="submit">Skicka inloggningslänk</button>
          </form>
        )}
      </section>
    </main>
  );
}
