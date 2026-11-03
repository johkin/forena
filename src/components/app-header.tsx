"use client";
import { usePathname } from "next/navigation";
import { MyTeamsPanel, myTeamsSchema, type LoadMyTeams } from "./my-teams-panel";
import { SystemAdminLink } from "./system-admin-link";

import type { ReactNode } from "react";
import { AppHeaderFrame } from "./app-header-frame";
import { SessionMenu } from "./session-menu";
import { ApplicationMenu } from "./application-menu";
import type { Organization, Team, Workspace } from "@/domain/club";
import { OrganizationMenu } from "./organization-menu";
import { NavigationLinks } from "./navigation-links";
import { LogoutButton } from "@/components/logout-button";
import { NotificationSettings } from "@/components/notification-settings";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";

export type AppHeaderProps = {
  sidebarNavigation?: boolean;
  homeHref?: string;
  navigation?: ReactNode;
  organization?: Organization;
  team?: Team;
  workspaces?: Workspace[];
  accountEmail?: string;
  loginHref?: string;
  logoutDestination?: string;
  adminHref?: string;
  accountMenu?: "full" | "session";
};

const loadMyTeams: LoadMyTeams = async signal => {
  const response = await fetch("/api/me/teams", { signal, cache: "no-store" });
  if (!response.ok) throw new Error("Dina lag kunde inte hämtas.");
  return myTeamsSchema.parse(await response.json());
};

export function AppHeader({ homeHref = "/", navigation, organization, team, workspaces, accountEmail, loginHref, logoutDestination = "/", adminHref, sidebarNavigation = false, accountMenu = "full" }: AppHeaderProps) {
  const pathname = usePathname();
  return <AppHeaderFrame homeHref={homeHref} sidebarNavigation={sidebarNavigation} mobileNavigation={Boolean(accountEmail && accountMenu === "full")}
    teamsNavigation={<MyTeamsPanel key={accountEmail} loadTeams={loadMyTeams} pathname={pathname} />}
    actions={accountEmail ? accountMenu === "full" ? <NotificationSettings /> : null : <a className="secondary" href={loginHref ?? `/login?next=${encodeURIComponent(team && organization ? `/o/${organization.slug}/t/${team.slug}` : homeHref)}`}>Logga in</a>}>
    <AppMenuContent organization={organization} team={team} workspaces={workspaces} navigation={navigation} accountEmail={accountEmail} loginHref={loginHref} homeHref={homeHref} logoutDestination={logoutDestination} adminHref={adminHref} accountMenu={accountMenu} />
  </AppHeaderFrame>;
}

export function AppMenuContent({ organization, team, workspaces, navigation, accountEmail, adminHref, loginHref, homeHref = "/", logoutDestination = "/", accountMenu = "full" }: AppHeaderProps) {
  if (accountMenu === "session") return <SessionMenu accountEmail={accountEmail} homeHref={homeHref} loginHref={loginHref}
    navigation={accountEmail ? <NavigationLinks label="Personligt" items={[{ href: homeHref, label: "Familjens kallelser" }]} /> : undefined}
    logout={<LogoutButton destination={logoutDestination} />} />;
  return <ApplicationMenu accountEmail={accountEmail}
    personalNavigation={<NavigationLinks label="Personligt" items={[{ href: "/", label: "Min översikt" }]} />}
    workspace={organization && workspaces?.length ? <WorkspaceSwitcher organization={organization} team={team} workspaces={workspaces} /> : undefined}
    navigation={navigation}
    assistantNavigation={organization && accountEmail ? <NavigationLinks label="Assistent" items={[{ href: `/o/${organization.slug}/memories`, label: "Minnen" }, ...(adminHref ? [{ href: `/o/${organization.slug}/activity-settings`, label: "Aktivitetsinställningar" }] : [])]} /> : undefined}
    organizationNavigation={organization ? <OrganizationMenu organizationSlug={organization.slug} canAdminister={Boolean(adminHref)} /> : !navigation && !accountEmail ? <NavigationLinks label="Navigation" items={[{ href: homeHref, label: "Översikt" }]} /> : undefined}
    accountLinks={accountEmail ? <><a href="/profile">Min profil</a><SystemAdminLink accountEmail={accountEmail} /></> : undefined}
    logout={<LogoutButton destination={logoutDestination} />} loginHref={loginHref ?? `/login?next=${encodeURIComponent(homeHref)}`} connectHref="/connect" />;
}
