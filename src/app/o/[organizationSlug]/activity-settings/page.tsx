import { ActivitySettingsPage } from "@/components/activity-settings-page";
export default async function Page({ params, searchParams }: { params: Promise<{ organizationSlug: string }>; searchParams: Promise<{ team?: string; scope?: string; scopeId?: string; saved?: string; error?: string }> }) {
 return <ActivitySettingsPage organizationSlug={(await params).organizationSlug} query={await searchParams}/>;
}
