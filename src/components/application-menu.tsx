import type { ReactNode } from "react";
import type { NavigationLink } from "./navigation-link";

/** Canonical full menu shared by Next and React/Kotlin; slots contain authorized links. */
export function ApplicationMenu({ accountEmail, personalNavigation, workspace, navigation, assistantNavigation,
  organizationNavigation, accountLinks, logout, loginHref = "/login", connectHref, linkComponent: Link = "a",
}: {
  accountEmail?: string; personalNavigation?: ReactNode; workspace?: ReactNode; navigation?: ReactNode;
  assistantNavigation?: ReactNode; organizationNavigation?: ReactNode; accountLinks?: ReactNode;
  logout?: ReactNode; loginHref?: string; connectHref?: string; linkComponent?: NavigationLink;
}) {
  return <>
    {accountEmail ? <div className="header-menu-section">{personalNavigation ?? <nav aria-label="Personligt"><Link href="/">Min översikt</Link></nav>}</div> : null}
    {workspace ? <div className="header-menu-section"><p className="eyebrow">Arbetsyta</p>{workspace}</div> : null}
    {navigation ? <div className="header-menu-section header-menu-navigation">{navigation}</div> : null}
    {assistantNavigation ? <div className="header-menu-section header-menu-account"><p className="eyebrow">Assistent</p>{assistantNavigation}</div> : null}
    {organizationNavigation ? <div className="header-menu-section header-menu-account"><p className="eyebrow">Förening</p>{organizationNavigation}</div> : null}
    <div className="header-menu-section header-menu-account">
      {accountEmail ? <><p className="eyebrow">Konto</p><small className="header-menu-email">{accountEmail}</small>{accountLinks}{logout}</> : <Link href={loginHref}>Logga in</Link>}
      {connectHref ? <Link href={connectHref}>Anslut AI</Link> : null}
      <Link href="/components">Komponenter</Link>
    </div>
  </>;
}
