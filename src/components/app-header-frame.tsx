"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useModalScrollLock } from "../lib/use-modal-scroll-lock";

/** Shared responsive header, drawer and focus behavior, independent of routing/auth. */
export function AppHeaderFrame({ homeHref = "/", sidebarNavigation = false, actions, children }: {
  homeHref?: string; sidebarNavigation?: boolean; actions?: ReactNode; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if (sidebarNavigation && media.matches) setOpen(false); };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, [sidebarNavigation]);

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    const trigger = triggerRef.current;
    const focusable = () => Array.from(menu?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
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
      {actions}
      <button ref={triggerRef} className={`header-menu-trigger ${sidebarNavigation ? "sidebar-menu-trigger" : ""}`} type="button" aria-label={open ? "Stäng meny" : "Öppna meny"} aria-expanded={open} aria-controls="header-menu" onClick={() => setOpen((value) => !value)}>
        <span aria-hidden="true">{open ? "×" : "☰"}</span><span>Meny</span>
      </button>
    </div>
    {open ? <MenuScrollLock><div className="header-menu-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div ref={menuRef} id="header-menu" className="header-menu-panel" role="dialog" aria-modal="true" aria-label="Huvudmeny" tabIndex={-1} onClick={(event) => { if ((event.target as HTMLElement).closest("a, nav button")) setOpen(false); }}>
        <div className="header-menu-heading"><strong>Meny</strong><button type="button" aria-label="Stäng meny" onClick={() => setOpen(false)}>×</button></div>
        {children}
      </div>
    </div></MenuScrollLock> : null}
  </header>;
}

function MenuScrollLock({ children }: { children: ReactNode }) {
  useModalScrollLock();
  return children;
}
