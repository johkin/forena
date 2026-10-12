"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
/** Only the current account's database platform role makes this link visible. */
export function SystemAdminLink({ accountEmail }: { accountEmail: string }) {
  const [access, setAccess] = useState<{ email: string; allowed: boolean } | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let active = true;
    const supabase = createClient();
    Promise.resolve(supabase.rpc("has_platform_role", { allowed_roles: ["system_admin"] })).then(({ data, error }) => { if (active) setAccess({ email: accountEmail, allowed: !error && data === true }); }).catch(() => { if (active) setAccess({ email: accountEmail, allowed: false }); });
    return () => { active = false; };
  }, [accountEmail]);
  return access?.email === accountEmail && access.allowed ? <a href="/system">Systemadministration</a> : null;
}
