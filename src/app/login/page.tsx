import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PasskeySignIn } from "@/components/passkey-sign-in";
import { requestMagicLink } from "./actions";

type Props = {
  searchParams: Promise<{ error?: string; sent?: string; next?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { error, sent, next } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/setup";
  if (data.user) redirect(safeNext);

  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="brand-mark">F</span>
        <p className="eyebrow">Förena</p>
        <h1>Logga in</h1>
        <p>Vi skickar en säker engångslänk till din e-postadress.</p>

        <PasskeySignIn next={safeNext} />
        <div className="auth-divider"><span>eller</span></div>

        {sent === "1" ? (
          <div className="auth-message success">
            Kontrollera din inkorg och öppna länken för att fortsätta.
          </div>
        ) : (
          <form action={requestMagicLink} className="auth-form">
            <input name="next" type="hidden" value={safeNext} />
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
