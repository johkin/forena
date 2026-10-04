"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
  adminHref?: string;
};

export function AppHeader({ homeHref = "/", navigation, organization, team, workspaces, accountEmail, loginHref, logoutDestination = "/", adminHref }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    const trigger = triggerRef.current;
    const focusable = () => Array.from(menu?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    (focusable()[0] ?? menu)?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); menu?.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !menu?.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !menu?.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); trigger?.focus(); };
  }, [open]);

  return <header className="topbar">
    <a className="brand" href={homeHref} aria-label="Förena startsida"><span className="brand-mark">F</span><span>Förena</span></a>
    <div className="topbar-actions">
      {accountEmail ? <NotificationSettings /> : null}
      <button ref={triggerRef} className="header-menu-trigger" type="button" aria-label={open ? "Stäng meny" : "Öppna meny"} aria-expanded={open} aria-controls="header-menu" onClick={() => setOpen((value) => !value)}>
        <span aria-hidden="true">{open ? "×" : "☰"}</span><span>Meny</span>
      </button>
    </div>
    {open ? <div className="header-menu-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div ref={menuRef} id="header-menu" className="header-menu-panel" role="dialog" aria-modal="true" aria-label="Huvudmeny" tabIndex={-1} onClick={(event) => { if ((event.target as HTMLElement).closest("a, nav button")) setOpen(false); }}>
        <div className="header-menu-heading"><strong>Meny</strong><button type="button" aria-label="Stäng meny" onClick={() => setOpen(false)}>×</button></div>
        {organization && workspaces?.length ? <div className="header-menu-section"><p className="eyebrow">Arbetsyta</p><WorkspaceSwitcher organization={organization} team={team} workspaces={workspaces} /></div> : null}
        {navigation ? <div className="header-menu-section header-menu-navigation">{navigation}</div> : null}
        {organization && accountEmail ? <div className="header-menu-section header-menu-account"><p className="eyebrow">Assistent</p><a href={`/o/${organization.slug}/memories`}>Minnen</a></div> : null}
        {adminHref ? <div className="header-menu-section header-menu-account"><p className="eyebrow">Förening</p><a href={adminHref}>Administrera ledare och roller</a></div> : null}
        <div className="header-menu-section header-menu-account">
          {accountEmail ? <><p className="eyebrow">Konto</p><small className="header-menu-email">{accountEmail}</small><a href="/profile">Min profil</a><LogoutButton destination={logoutDestination} /></>
            : <a href={loginHref ?? `/login?next=${encodeURIComponent(homeHref)}`}>Logga in</a>}
          <a href="/connect">Anslut AI</a>
        </div>
      </div>
    </div> : null}
  </header>;
}
