import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PasskeySignIn } from "@/components/passkey-sign-in";
import { requestMagicLink, signInWithPassword, signUpWithPassword } from "./actions";

type Props = {
  searchParams: Promise<{ error?: string; sent?: string; next?: string; mode?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { error, sent, next, mode } = await searchParams;
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
        <p>Logga in med passkey, lösenord eller en säker engångslänk.</p>

        <PasskeySignIn next={safeNext} />
        <div className="auth-divider"><span>eller</span></div>

        {sent === "1" || sent === "signup" ? (
          <div className="auth-message success">
            {sent === "signup" ? "Kontrollera din inkorg och verifiera adressen för att aktivera kontot." : "Kontrollera din inkorg och öppna länken för att fortsätta."}
          </div>
        ) : mode === "password" || mode === "create" ? (
          <>
            <form action={mode === "create" ? signUpWithPassword : signInWithPassword} className="auth-form">
              <input name="next" type="hidden" value={safeNext} />
              <label htmlFor="password-email">E-postadress</label>
              <input id="password-email" name="email" type="email" autoComplete="email" required />
              <label htmlFor="password">Lösenord</label>
              <input id="password" name="password" type="password" minLength={8} autoComplete={mode === "create" ? "new-password" : "current-password"} required />
              {error ? <p className="auth-error">{error}</p> : null}
              <button className="primary" type="submit">{mode === "create" ? "Skapa konto" : "Logga in"}</button>
            </form>
            <div className="auth-mode-links">
              <a href={`/login?mode=${mode === "create" ? "password" : "create"}&next=${encodeURIComponent(safeNext)}`}>{mode === "create" ? "Jag har redan ett lösenord" : "Skapa ett konto med lösenord"}</a>
              <a href={`/login?next=${encodeURIComponent(safeNext)}`}>Använd e-postlänk i stället</a>
            </div>
          </>
        ) : (
          <>
            <form action={requestMagicLink} className="auth-form">
              <input name="next" type="hidden" value={safeNext} />
              <label htmlFor="email">E-postadress</label>
              <input id="email" name="email" type="email" autoComplete="email" required />
              {error ? <p className="auth-error">{error}</p> : null}
              <button className="primary" type="submit">Skicka inloggningslänk</button>
            </form>
            <div className="auth-mode-links"><a href={`/login?mode=password&next=${encodeURIComponent(safeNext)}`}>Logga in med lösenord</a></div>
          </>
        )}
      </section>
    </main>
  );
}
