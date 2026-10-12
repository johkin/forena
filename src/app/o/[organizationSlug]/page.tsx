import { notFound } from "next/navigation";
import { GeneralWorkspace } from "@/components/general-workspace";
import { getGeneralWorkspace } from "@/data/general-workspace";

type Props = { params: Promise<{ organizationSlug: string }> };

export default async function OrganizationWorkspacePage({ params }: Props) {
  const { organizationSlug } = await params;
  const data = await getGeneralWorkspace(organizationSlug);
  if (!data) notFound();
  return <GeneralWorkspace data={data} />;
}
