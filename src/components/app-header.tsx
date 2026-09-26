import type { ReactNode } from "react";
import { ProfileButton } from "@/components/profile-button";

type Props = {
  homeHref?: string;
  menu?: ReactNode;
  actions?: ReactNode;
  showProfile?: boolean;
};

export function AppHeader({ homeHref = "/", menu, actions, showProfile = true }: Props) {
  return (
    <header className="topbar">
      <div className="topbar-brand-row">
        {menu}
        <a className="brand" href={homeHref} aria-label="Förena startsida">
          <span className="brand-mark">F</span>
          <span>Förena</span>
        </a>
      </div>
      <div className="topbar-actions">
        {showProfile ? <ProfileButton /> : null}
        {actions}
      </div>
    </header>
  );
}
