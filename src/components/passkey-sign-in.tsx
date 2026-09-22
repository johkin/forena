"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function PasskeySignIn() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    setPending(true);
    setError("");

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPasskey();

    if (signInError) {
      setPending(false);
      if (signInError.name !== "NotAllowedError") {
        setError("Inloggningen med passkey misslyckades. Försök igen eller använd e-post.");
      }
      return;
    }

    router.push("/setup");
    router.refresh();
  }

  return (
    <div className="passkey-action">
      <button className="secondary passkey-button" disabled={pending} onClick={signIn} type="button">
        {pending ? "Öppnar passkey…" : "Logga in med passkey"}
      </button>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </div>
  );
}
