import type { ReactNode } from "react";
import { ProfileButton } from "@/components/profile-button";

type Props = {
  homeHref?: string;
  menu?: ReactNode;
  actions?: ReactNode;
  showProfile?: boolean;
  accountEmail?: string;
};

export function AppHeader({ homeHref = "/", menu, actions, showProfile = true, accountEmail }: Props) {
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
        {accountEmail ? <span className="account-identity" title={accountEmail}>Inloggad som <strong>{accountEmail}</strong></span> : null}
        {showProfile ? <ProfileButton /> : null}
        {actions}
      </div>
    </header>
  );
}
