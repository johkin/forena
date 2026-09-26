import { notFound, redirect } from "next/navigation";
import { GeneralWorkspace } from "@/components/general-workspace";
import { getGeneralWorkspace } from "@/data/general-workspace";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type Props = { params: Promise<{ organizationSlug: string }> };

export default async function OrganizationWorkspacePage({ params }: Props) {
  const { organizationSlug } = await params;
  const data = await getGeneralWorkspace(organizationSlug);
  if (!data && isSupabaseConfigured()) redirect(`/login?next=${encodeURIComponent(`/o/${organizationSlug}`)}`);
  if (!data) notFound();
  return <GeneralWorkspace data={data} />;
}
