"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Organization, Team, Workspace } from "@/domain/club";
import { LogoutButton } from "@/components/logout-button";
import { NotificationSettings } from "@/components/notification-settings";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";

type Props = {
  homeHref?: string;
  navigation?: ReactNode;
  organization?: Organization;
  team?: Team;
  workspaces?: Workspace[];
  accountEmail?: string;
  loginHref?: string;
  logoutDestination?: string;
};

export function AppHeader({ homeHref = "/", navigation, organization, team, workspaces, accountEmail, loginHref, logoutDestination = "/" }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onEscape(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [open]);

  return <header className="topbar">
    <a className="brand" href={homeHref} aria-label="Förena startsida"><span className="brand-mark">F</span><span>Förena</span></a>
    <div className="topbar-actions">
      {accountEmail ? <NotificationSettings /> : null}
      <button className="header-menu-trigger" type="button" aria-label={open ? "Stäng meny" : "Öppna meny"} aria-expanded={open} aria-controls="header-menu" onClick={() => setOpen((value) => !value)}>
        <span aria-hidden="true">{open ? "×" : "☰"}</span><span>Meny</span>
      </button>
    </div>
    {open ? <div className="header-menu-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div id="header-menu" className="header-menu-panel" role="dialog" aria-modal="true" aria-label="Huvudmeny" onClick={(event) => { if ((event.target as HTMLElement).closest("a, nav button")) setOpen(false); }}>
        <div className="header-menu-heading"><strong>Meny</strong><button type="button" aria-label="Stäng meny" onClick={() => setOpen(false)}>×</button></div>
        {organization && workspaces?.length ? <div className="header-menu-section"><p className="eyebrow">Arbetsyta</p><WorkspaceSwitcher organization={organization} team={team} workspaces={workspaces} /></div> : null}
        {navigation ? <div className="header-menu-section header-menu-navigation">{navigation}</div> : null}
        <div className="header-menu-section header-menu-account">
          {accountEmail ? <><p className="eyebrow">Konto</p><small className="header-menu-email">{accountEmail}</small><a href="/profile">Min profil</a><LogoutButton destination={logoutDestination} /></>
            : <a href={loginHref ?? `/login?next=${encodeURIComponent(homeHref)}`}>Logga in</a>}
        </div>
      </div>
    </div> : null}
  </header>;
}
