"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PersonalActivity, PersonalDashboardData } from "@/data/personal-dashboard";
import type { FamilyActivity } from "@/domain/club";
import { AppShell } from "./app-shell";
import { PersonalHome } from "./personal-home";
import { ActivityDetailModal } from "./activity-detail-modal";

export function PersonalDashboard({ data, administrationError }: { data: PersonalDashboardData; administrationError?: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<PersonalActivity>();
  const unique = [...new Map(data.activities.map(item => [item.activity.id, item])).values()];
  const byId = new Map(unique.map(item => [item.activity.id, item]));
  function open(item: FamilyActivity) { setSelected(byId.get(item.activity.id)); }
  useEffect(() => {
    const refresh = () => router.refresh();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    const listener = (event: MessageEvent) => { if (event.data?.type === "activity-notification") refresh(); };
    navigator.serviceWorker?.addEventListener("message", listener);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", listener);
    };
  }, [router]);
  return <AppShell accountEmail={data.accountEmail}>
    <main className="content personal-dashboard">
      {administrationError ? <p role="alert" className="auth-error">{administrationError}</p> : null}
      <PersonalHome items={data.activities} activities={unique.map(item=>item.activity)} referenceTime={data.referenceTime}
        onOpenActivity={open} onAnswered={()=>router.refresh()}
        organizations={data.organizations.map(organization=>({id:organization.id,name:organization.name,role:organization.role,href:`/o/${organization.slug}`}))}
        teams={data.teams.map(({team,organization,roles})=>({id:team.id,organizationId:organization.id,name:team.name,roles,href:`/o/${organization.slug}/t/${team.slug}`}))} />
      {!data.organizations.length ? <a href="/setup">Skapa en förening</a> : null}
    </main>
    {selected ? <ActivityDetailModal key={selected.activity.id} activity={selected.activity} organization={selected.organization} team={selected.team} canManageActivity={false} canManageInvitations={false} canManageAttendance={false} rosterMembers={[]} onEdit={() => {}} onClose={() => { setSelected(undefined); router.refresh(); }} /> : null}
  </AppShell>;
}
