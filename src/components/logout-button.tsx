"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton({ destination = "/" }: { destination?: string }) {
  const router = useRouter();
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

    router.replace(destination);
    router.refresh();
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
