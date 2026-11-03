"use client";
import type { NavigationLink } from "./navigation-link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useModalScrollLock } from "../lib/use-modal-scroll-lock";

/** Shared responsive header, drawer and focus behavior, independent of routing/auth. */
export function AppHeaderFrame({ homeHref = "/", sidebarNavigation = false, mobileNavigation = false, teamsNavigation, actions, children, linkComponent: Link = "a" }: {
  homeHref?: string; sidebarNavigation?: boolean; mobileNavigation?: boolean; teamsNavigation?: ReactNode; actions?: ReactNode; children: ReactNode; linkComponent?: NavigationLink;
}) {
  const [panel, setPanel] = useState<"menu" | "teams" | null>(null);
  const open = panel !== null;
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const teamsTriggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if ((sidebarNavigation || panel === "teams") && media.matches) setPanel(null); };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, [sidebarNavigation, panel]);

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    const trigger = panel === "teams" ? teamsTriggerRef.current : triggerRef.current;
    const focusable = () => Array.from(menu?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    (focusable()[0] ?? menu)?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { setPanel(null); return; }
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
  }, [open, panel]);

  return <header className={`topbar${mobileNavigation ? " has-mobile-navigation" : ""}`}>
    <Link className="brand" href={homeHref} aria-label="Förena startsida"><span className="brand-mark">F</span><span>Förena</span></Link>
    <div className="topbar-actions">
      {actions}
      <nav className={mobileNavigation ? "mobile-bottom-navigation" : undefined} aria-label="Huvudnavigation">
        {mobileNavigation ? <>
          <Link className="mobile-navigation-link" href="/" onClick={() => setPanel(null)}><NavigationIcon kind="home" /><span>Min översikt</span></Link>
          <button ref={teamsTriggerRef} className="mobile-navigation-link" type="button" aria-expanded={panel === "teams"} aria-controls={menuId} onClick={() => setPanel(value => value === "teams" ? null : "teams")}>
            <NavigationIcon kind="teams" /><span>Mina lag</span>
          </button>
        </> : null}
        <button ref={triggerRef} className={`header-menu-trigger ${sidebarNavigation ? "sidebar-menu-trigger" : ""}`} type="button" aria-label={panel === "menu" ? "Stäng meny" : "Öppna meny"} aria-expanded={panel === "menu"} aria-controls={menuId} onClick={() => setPanel(value => value === "menu" ? null : "menu")}>
          <span aria-hidden="true">{panel === "menu" ? "×" : "☰"}</span><span>Meny</span>
        </button>
      </nav>
    </div>
    {open ? <MenuScrollLock><div className="header-menu-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPanel(null); }}>
      <div ref={menuRef} id={menuId} className="header-menu-panel" role="dialog" aria-modal="true" aria-label={panel === "teams" ? "Mina lag" : "Huvudmeny"} tabIndex={-1} onClick={(event) => { if ((event.target as HTMLElement).closest("a, nav button")) setPanel(null); }}>
        <div className="header-menu-heading"><strong>{panel === "teams" ? "Mina lag" : "Meny"}</strong><button type="button" aria-label={panel === "teams" ? "Stäng Mina lag" : "Stäng meny"} onClick={() => setPanel(null)}>×</button></div>
        {panel === "teams" ? teamsNavigation : children}
      </div>
    </div></MenuScrollLock> : null}
  </header>;
}

function NavigationIcon({ kind }: { kind: "home" | "teams" }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "home" ? <path d="m3 10 9-7 9 7v11h-7v-7h-4v7H3Z" /> : <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-3-5" /></>}
  </svg>;
}

function MenuScrollLock({ children }: { children: ReactNode }) {
  useModalScrollLock();
  return children;
}
