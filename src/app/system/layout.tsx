import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function SystemLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/system");
  const { data: allowed } = await supabase.rpc("has_platform_role", { allowed_roles: ["system_admin"] });
  if (!allowed) redirect("/");
  return <><header className="system-header"><Link href="/system"><strong>Förena</strong><span>Systemadministration</span></Link><nav><Link href="/system/administrators">Administratörer</Link><Link href="/system/disciplines">Discipliner</Link><Link href="/system/memories">Assistentminnen</Link><Link href="/">Till Förena</Link></nav></header>{children}</>;
}
