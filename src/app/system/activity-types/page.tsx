import { ActivitySettingsPage } from "@/components/activity-settings-page";
export default async function Page({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; typeId?: string }> }) { return <ActivitySettingsPage query={await searchParams}/>; }
