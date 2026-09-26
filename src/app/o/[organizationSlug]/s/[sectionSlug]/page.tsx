import { notFound, redirect } from "next/navigation";
import { GeneralWorkspace } from "@/components/general-workspace";
import { getGeneralWorkspace } from "@/data/general-workspace";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type Props = { params: Promise<{ organizationSlug: string; sectionSlug: string }> };

export default async function SectionWorkspacePage({ params }: Props) {
  const { organizationSlug, sectionSlug } = await params;
  const data = await getGeneralWorkspace(organizationSlug, sectionSlug);
  if (!data && isSupabaseConfigured()) redirect(`/login?next=${encodeURIComponent(`/o/${organizationSlug}/s/${sectionSlug}`)}`);
  if (!data) notFound();
  return <GeneralWorkspace data={data} />;
}
