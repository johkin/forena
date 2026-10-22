import type { NavigationLink } from "./navigation-link";
import type { ReactNode } from "react";

export function SessionMenu({ accountEmail, homeHref = "/", homeLabel = "Mina aktiviteter", loginHref = "/login", navigation, logout, linkComponent: Link = "a" }: {
  accountEmail?: string; homeHref?: string; homeLabel?: string; loginHref?: string; navigation?: ReactNode; logout: ReactNode; linkComponent?: NavigationLink;
}) {
  return <>
    {accountEmail ? <div className="header-menu-section">{navigation ?? <nav aria-label="Personligt"><Link href={homeHref}>{homeLabel}</Link></nav>}</div> : null}
    <div className="header-menu-section header-menu-account">
      {accountEmail ? <><p className="eyebrow">Konto</p><small className="header-menu-email">{accountEmail}</small>{logout}</> : <Link href={loginHref}>Logga in</Link>}
      <Link href="/components">Komponenter</Link>
    </div>
  </>;
}
