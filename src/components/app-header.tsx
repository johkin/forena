"use client";
import { SystemAdminLink } from "./system-admin-link";

import type { ReactNode } from "react";
import { AppHeaderFrame } from "./app-header-frame";
import { SessionMenu } from "./session-menu";
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

export function AppHeader({ homeHref = "/", navigation, organization, team, workspaces, accountEmail, loginHref, logoutDestination = "/", adminHref, sidebarNavigation = false, accountMenu = "full" }: AppHeaderProps) {
  return <AppHeaderFrame homeHref={homeHref} sidebarNavigation={sidebarNavigation}
    actions={accountEmail ? accountMenu === "full" ? <NotificationSettings /> : null : <a className="secondary" href={loginHref ?? `/login?next=${encodeURIComponent(team && organization ? `/o/${organization.slug}/t/${team.slug}` : homeHref)}`}>Logga in</a>}>
    <AppMenuContent organization={organization} team={team} workspaces={workspaces} navigation={navigation} accountEmail={accountEmail} loginHref={loginHref} homeHref={homeHref} logoutDestination={logoutDestination} adminHref={adminHref} accountMenu={accountMenu} />
  </AppHeaderFrame>;
}

export function AppMenuContent({ organization, team, workspaces, navigation, accountEmail, adminHref, loginHref, homeHref = "/", logoutDestination = "/", accountMenu = "full" }: AppHeaderProps) {
  if (accountMenu === "session") return <SessionMenu accountEmail={accountEmail} homeHref={homeHref} loginHref={loginHref}
    navigation={accountEmail ? <NavigationLinks label="Personligt" items={[{ href: homeHref, label: "Familjens kallelser" }]} /> : undefined}
    logout={<LogoutButton destination={logoutDestination} />} />;
  return <>
        {accountEmail ? <div className="header-menu-section"><NavigationLinks label="Personligt" items={[{ href: "/", label: "Min översikt" }]} /></div> : null}
        {organization && workspaces?.length ? <div className="header-menu-section"><p className="eyebrow">Arbetsyta</p><WorkspaceSwitcher organization={organization} team={team} workspaces={workspaces} /></div> : null}
        {navigation ? <div className="header-menu-section header-menu-navigation">{navigation}</div> : null}
        {organization && accountEmail ? <div className="header-menu-section header-menu-account"><p className="eyebrow">Assistent</p><NavigationLinks label="Assistent" items={[{ href: `/o/${organization.slug}/memories`, label: "Minnen" }, ...(adminHref ? [{ href: `/o/${organization.slug}/activity-settings`, label: "Aktivitetsinställningar" }] : [])]} /></div> : null}
        {organization ? <div className="header-menu-section header-menu-account"><p className="eyebrow">Förening</p><OrganizationMenu organizationSlug={organization.slug} canAdminister={Boolean(adminHref)} /></div> : !navigation && !accountEmail ? <div className="header-menu-section"><NavigationLinks label="Navigation" items={[{ href: homeHref, label: "Översikt" }]} /></div> : null}
        <div className="header-menu-section header-menu-account">
          {accountEmail ? <><p className="eyebrow">Konto</p><small className="header-menu-email">{accountEmail}</small>{accountMenu === "full" ? <><a href="/profile">Min profil</a><SystemAdminLink accountEmail={accountEmail}/></> : null}<LogoutButton destination={logoutDestination} /></>
            : <a href={loginHref ?? `/login?next=${encodeURIComponent(homeHref)}`}>Logga in</a>}
          {accountMenu === "full" ? <a href="/connect">Anslut AI</a> : null}
          <a href="/components">Komponenter</a>
        </div>
  </>;
}

