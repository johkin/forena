"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Status = "checking" | "available" | "registering" | "registered" | "unsupported";

export function PasskeyEnrollment({ next = "/setup" }: { next?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!window.PublicKeyCredential) {
      queueMicrotask(() => setStatus("unsupported"));
      return;
    }

    const supabase = createClient();
    void supabase.auth.passkey.list().then(({ data, error: listError }) => {
      if (listError) {
        setStatus("available");
        return;
      }
      setStatus(data && data.length > 0 ? "registered" : "available");
    });
  }, []);

  async function register() {
    setStatus("registering");
    setError("");

    const supabase = createClient();
    const { error: registrationError } = await supabase.auth.registerPasskey();

    if (registrationError) {
      setStatus("available");
      if (registrationError.name !== "NotAllowedError") {
        setError("Passkey kunde inte registreras. Du kan fortsätta och prova igen senare.");
      }
      return;
    }

    setStatus("registered");
  }

  function continueToSetup() {
    router.push(next);
    router.refresh();
  }

  if (status === "checking") {
    return <p className="auth-muted">Kontrollerar stöd för passkeys…</p>;
  }

  if (status === "unsupported") {
    return (
      <>
        <p className="auth-muted">Den här webbläsaren stöder inte passkeys.</p>
        <button className="primary" onClick={continueToSetup} type="button">Fortsätt</button>
      </>
    );
  }

  if (status === "registered") {
    return (
      <>
        <div className="auth-message" role="status">Passkey är klar. Nästa gång kan du logga in utan e-post.</div>
        <button className="primary" onClick={continueToSetup} type="button">Fortsätt</button>
      </>
    );
  }

  return (
    <div className="auth-form">
      <button className="primary" disabled={status === "registering"} onClick={register} type="button">
        {status === "registering" ? "Registrerar…" : "Skapa passkey"}
      </button>
      <button className="link-button" onClick={continueToSetup} type="button">Inte nu</button>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </div>
  );
}
