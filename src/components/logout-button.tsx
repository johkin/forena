"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton({ destination = "/" }: { destination?: string }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function logout() {
    setPending(true);
    setFailed(false);

    const supabase = createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });

    if (error) {
      setPending(false);
      setFailed(true);
      return;
    }

    // Discard the previous account’s in-memory router cache as well as cookies.
    window.location.replace(destination);
  }

  return (
    <button
      aria-label="Logga ut från Förena"
      className="logout-button"
      disabled={pending}
      onClick={logout}
      type="button"
    >
      {pending ? "Loggar ut…" : failed ? "Försök igen" : "Logga ut"}
    </button>
  );
}

