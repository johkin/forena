"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PersonalActivity, PersonalDashboardData } from "@/data/personal-dashboard";
import type { FamilyActivity } from "@/domain/club";
import { AppShell } from "./app-shell";
import { PersonalOverview } from "./personal-overview";
import { TeamCalendar } from "./team-calendar";
import { ActivityDetailModal } from "./activity-detail-modal";

export function PersonalDashboard({ data }: { data: PersonalDashboardData }) {
  const router = useRouter();
  const [view, setView] = useState<"agenda" | "calendar">("agenda");
  const [selected, setSelected] = useState<PersonalActivity>();
  // Cross-club calendar uses one explicit display zone; modal uses the host club's zone.
  const timeZone = "Europe/Stockholm";
  const now = Date.parse(data.referenceTime);
  const pending = data.activities.filter(item => item.invitation?.response === "pending" && Date.parse(item.activity.startsAt) > now && (!item.activity.responseDueAt || Date.parse(item.activity.responseDueAt) > now));
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
      <div className="welcome"><div><p className="eyebrow">Förena · Personligt</p><h1>Min översikt</h1><p>Din och barnens vardag – alla lag och föreningar på samma plats.</p></div></div>
      <PersonalOverview activities={pending} timeZone={timeZone} onOpenActivity={open} title="Behöver svar" id="pending-activities-title" emptyMessage="Alla aktuella kallelser är besvarade." />
      <div className="personal-calendar-section">
        <div className="personal-view-switch" role="group" aria-label="Visning av familjens aktiviteter">
          <button type="button" className={view === "agenda" ? "primary" : "secondary"} aria-pressed={view === "agenda"} onClick={() => setView("agenda")}>Agenda</button>
          <button type="button" className={view === "calendar" ? "primary" : "secondary"} aria-pressed={view === "calendar"} onClick={() => setView("calendar")}>Kalender</button>
        </div>
        {view === "agenda" ? <PersonalOverview activities={data.activities} timeZone={timeZone} onOpenActivity={open} title="Kommande aktiviteter" id="upcoming-activities-title" emptyMessage="Inga kommande kallelser eller bokade arbetsuppgifter för familjen." /> : <>
          <p className="personal-calendar-zone">Familjens kalender · tider i svensk tid. Alla föreningar visas.</p>
          <TeamCalendar activities={unique.map(item => item.activity)} timeZone={timeZone} heading="Familjens kalender" showAllEvents onSelectActivity={activity => { setSelected(byId.get(activity.id)); }} eventLabel={activity => {
            const item = byId.get(activity.id)!;
            const names = data.activities.filter(a => a.activity.id === activity.id).map(a => a.member.displayName).join(", ");
            return `${activity.title} · ${item.organization.name} · ${item.team.name} · ${names}`;
          }} />
          {!unique.length ? <p className="overview-empty">Inga kommande aktiviteter för familjen.</p> : null}
        </>}
      </div>
      <section className="card" aria-labelledby="my-teams-title">
        <h2 id="my-teams-title">Mina lag och föreningar</h2>
        <div className="personal-workspaces">{data.organizations.map(organization => <div key={organization.id}>
          <h3><a href={`/o/${organization.slug}`}>{organization.name}</a></h3>
          {data.teams.filter(item => item.organization.id === organization.id).map(({ team, roles }) => <a className="personal-team-link" key={team.id} href={`/o/${organization.slug}/t/${team.slug}`}><strong>{team.name}</strong><span>{roles.join(" · ")}</span><span aria-hidden="true">→</span></a>)}
        </div>)}</div>
        {!data.organizations.length ? <p>Du är inte ansluten till någon förening ännu. Be din förening om en ansöknings- eller inbjudningslänk.</p> : null}
        {!data.organizations.length ? <a href="/setup">Skapa en förening</a> : null}
      </section>
    </main>
    {selected ? <ActivityDetailModal key={selected.activity.id} activity={selected.activity} organization={selected.organization} team={selected.team} canManageActivity={false} canManageInvitations={false} canManageAttendance={false} rosterMembers={[]} onEdit={() => {}} onClose={() => { setSelected(undefined); router.refresh(); }} /> : null}
  </AppShell>;
}
