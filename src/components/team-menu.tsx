"use client";

import { useState } from "react";

type TeamMenuItem = "overview" | "calendar" | "members";

type Props = {
  organizationSlug: string;
  teamSlug: string;
  teamName: string;
  canManageTeam: boolean;
  leaderView: boolean;
  activeItem?: TeamMenuItem;
  onSelectView?: (view: "overview" | "calendar") => void;
};

export function TeamMenu({
  organizationSlug,
  teamSlug,
  teamName,
  canManageTeam,
  leaderView,
  activeItem,
  onSelectView,
}: Props) {
  const [open, setOpen] = useState(false);
  const teamHref = `/o/${organizationSlug}/t/${teamSlug}`;

  function selectView(view: "overview" | "calendar") {
    setOpen(false);
    onSelectView?.(view);
  }

  return (
    <>
      <button
        className="mobile-menu-button"
        type="button"
        aria-label={open ? "Stäng meny" : "Öppna meny"}
        aria-expanded={open}
        aria-controls="main-navigation"
        onClick={() => setOpen((current) => !current)}
      >
        {open ? "✕" : "☰"}
      </button>

      {open ? <button className="mobile-menu-backdrop" aria-label="Stäng meny" type="button" onClick={() => setOpen(false)} /> : null}

      <aside id="main-navigation" className={`sidebar ${open ? "mobile-open" : ""}`} aria-label="Huvudmeny">
        <p className="eyebrow">{teamName}</p>
        <nav>
          {onSelectView ? (
            <>
              <button className={activeItem === "overview" ? "active" : ""} onClick={() => selectView("overview")} type="button">Översikt</button>
              <button className={activeItem === "calendar" ? "active" : ""} onClick={() => selectView("calendar")} type="button">Kalender</button>
            </>
          ) : (
            <>
              <a className={activeItem === "overview" ? "active" : ""} onClick={() => setOpen(false)} href={teamHref}>Översikt</a>
              <a className={activeItem === "calendar" ? "active" : ""} onClick={() => setOpen(false)} href={`${teamHref}?view=calendar`}>Kalender</a>
            </>
          )}
          <a
            className={activeItem === "members" ? "active" : ""}
            onClick={() => setOpen(false)}
            href={canManageTeam ? `${teamHref}/members` : "#members"}
          >
            Spelare och ledare
          </a>
          <a onClick={() => setOpen(false)} href="#attendance">Närvaro</a>
        </nav>
        {leaderView ? (
          <>
            <p className="eyebrow">Publicering</p>
            <nav>
              <a onClick={() => setOpen(false)} href="#news">Nyheter</a>
              <a onClick={() => setOpen(false)} href="#pages">Sidor</a>
            </nav>
          </>
        ) : null}
      </aside>
    </>
  );
}
