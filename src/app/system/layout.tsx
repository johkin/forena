import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function SystemLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/system");
  await supabase.rpc("claim_platform_admin_invite");
  const { data: allowed } = await supabase.rpc("has_platform_role", { allowed_roles: ["system_admin"] });
  if (!allowed) redirect("/");
  return <><header className="system-header"><a href="/system"><strong>Förena</strong><span>Systemadministration</span></a><nav><a href="/system/disciplines">Discipliner</a><a href="/system/memories">Assistentminnen</a><a href="/">Till Förena</a></nav></header>{children}</>;
}
