import { AppHeader } from "@/components/app-header";
import { SystemNavigation } from "@/components/system-navigation";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function SystemLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/system");
  const { data: allowed } = await supabase.rpc("has_platform_role", { allowed_roles: ["system_admin"] });
  if (!allowed) redirect("/");
  return <><AppHeader homeHref="/system" accountEmail={auth.user.email} navigation={<SystemNavigation/>}/>{children}</>;
}
