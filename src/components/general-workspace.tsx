"use client";

import { useMemo, useState } from "react";
import type { GeneralWorkspaceData, PublicActivity } from "@/data/general-workspace";
import type { Team } from "@/domain/club";
import { LogoutButton } from "@/components/logout-button";
import { NotificationSettings } from "@/components/notification-settings";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";

function dateKey(value: string, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function SharedCalendar({ activities, timeZone, organizationSlug }: { activities: PublicActivity[]; timeZone: string; organizationSlug: string }) {
  const initial = activities[0] ? dateKey(activities[0].startsAt, timeZone) : dateKey(new Date().toISOString(), timeZone);
  const [cursor, setCursor] = useState(() => { const [year, month] = initial.split("-").map(Number); return { year, month }; });
  const byDate = useMemo(() => { const map = new Map<string, PublicActivity[]>(); for (const item of activities) map.set(dateKey(item.startsAt, timeZone), [...(map.get(dateKey(item.startsAt, timeZone)) ?? []), item]); return map; }, [activities, timeZone]);
  const title = new Intl.DateTimeFormat("sv-SE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(cursor.year, cursor.month - 1, 1)));
  const first = new Date(Date.UTC(cursor.year, cursor.month - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate();
  const time = new Intl.DateTimeFormat("sv-SE", { timeZone, hour: "2-digit", minute: "2-digit" });
  function move(delta: number) { const next = new Date(Date.UTC(cursor.year, cursor.month - 1 + delta, 1)); setCursor({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 }); }
  return <section className="card team-calendar calendar-page general-calendar" aria-labelledby="shared-calendar-title">
    <div className="calendar-heading"><div><p className="eyebrow">Alla lag</p><h2 id="shared-calendar-title">{title}</h2></div><div><button className="secondary" onClick={() => move(-1)} type="button" aria-label="Föregående månad">←</button><button className="secondary" onClick={() => move(1)} type="button" aria-label="Nästa månad">→</button></div></div>
    <div className="calendar-weekdays">{["Mån","Tis","Ons","Tor","Fre","Lör","Sön"].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="calendar-grid">{Array.from({ length: 42 }, (_, index) => { const day = index - offset + 1; if (day < 1 || day > days) return <div className="calendar-day empty" key={index} />; const key = `${cursor.year}-${String(cursor.month).padStart(2,"0")}-${String(day).padStart(2,"0")}`; const items = byDate.get(key) ?? []; return <div className={`calendar-day ${items.length ? "has-activity" : ""}`} key={key}><strong>{day}</strong>{items.slice(0, 4).map((item) => <a className="calendar-event" href={`/o/${organizationSlug}/t/${item.teamSlug}`} key={item.id} title={`${item.teamName}: ${item.title}`}><b>{time.format(new Date(item.startsAt))}</b><span>{item.teamName} · {item.title}</span></a>)}{items.length > 4 ? <small>+{items.length - 4} till</small> : null}</div>; })}</div>
  </section>;
}

export function GeneralWorkspace({ data, focusTeam }: { data: GeneralWorkspaceData; focusTeam?: Team }) {
  const timeZone = data.organization.timeZone ?? "Europe/Stockholm";
  const visibleActivities = focusTeam ? data.activities.filter((activity) => activity.teamId === focusTeam.id) : data.activities;
  const visibleTeams = focusTeam ? [focusTeam] : data.teams;
  const nextMatches = visibleActivities.filter((activity) => activity.isMatch).slice(0, 6);
  const format = new Intl.DateTimeFormat("sv-SE", { timeZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const heading = focusTeam?.name ?? data.section?.name ?? data.organization.name;
  return <main><header className="topbar"><a className="brand" href={`/o/${data.organization.slug}`} aria-label="Förena startsida"><span className="brand-mark">F</span><span>Förena</span></a><div className="topbar-actions">{data.accountEmail ? <span className="account-identity">Inloggad som <strong>{data.accountEmail}</strong></span> : null}{data.accountEmail ? <NotificationSettings /> : null}<WorkspaceSwitcher organization={data.organization} workspaces={data.workspaces} /><LogoutButton /></div></header>
    <div className="shell general-shell"><aside className="sidebar"><p className="eyebrow">{focusTeam ? "Lag" : data.section ? "Sektion" : "Förening"}</p><nav><a className="active" href="#overview">Översikt</a><a href="#calendar">Kalender</a>{!focusTeam ? data.teams.map((team) => <a href={`/o/${data.organization.slug}/t/${team.slug}`} key={team.id}>{team.name}</a>) : null}</nav></aside>
      <section className="content"><div className="welcome" id="overview"><div><p className="eyebrow">{focusTeam ? `${data.section?.name ?? data.organization.name} · generell information` : data.section ? data.organization.name : "Föreningsöversikt"}</p><h1>{heading}</h1><p>{focusTeam ? "Publicerade aktiviteter och matcher för laget." : `Information och aktiviteter för ${data.section ? "sektionens" : "föreningens"} lag.`}</p></div></div>{data.source === "demo" ? <div className="demo-notice">Demoläge</div> : null}
        <div className="general-summary"><section className="card"><div className="card-heading"><div><p className="eyebrow">Kommande</p><h2>Nästa matcher</h2></div></div>{nextMatches.length ? <div className="public-match-list">{nextMatches.map((match) => <a href={`/o/${data.organization.slug}/t/${match.teamSlug}`} key={match.id}><span><small>{match.teamName}</small><strong>{match.title}</strong><span>{format.format(new Date(match.startsAt))} · {match.location}</span></span><b aria-hidden="true">→</b></a>)}</div> : <p className="overview-empty">Inga kommande matcher är publicerade.</p>}<p className="privacy-note">Laguppställningar och kallelsesvar visas bara i respektive lags behöriga vy.</p></section>
          <section className="card"><div className="card-heading"><div><p className="eyebrow">Lag</p><h2>{focusTeam ? focusTeam.name : `${visibleTeams.length} lag`}</h2></div></div><div className="team-directory">{visibleTeams.map((team) => <a href={`/o/${data.organization.slug}/t/${team.slug}`} key={team.id}><strong>{team.name}</strong>{team.season ? <span>{team.season}</span> : null}</a>)}</div></section></div>
        <div id="calendar"><SharedCalendar activities={visibleActivities} timeZone={timeZone} organizationSlug={data.organization.slug} /></div>
      </section></div></main>;
}
