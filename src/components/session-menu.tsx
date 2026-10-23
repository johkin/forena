import type { NavigationLink } from "./navigation-link";
import type { ReactNode } from "react";

export function SessionMenu({ accountEmail, homeHref = "/", homeLabel = "Mina aktiviteter", loginHref = "/login", securityHref, navigation, logout, linkComponent: Link = "a" }: {
  accountEmail?: string; homeHref?: string; homeLabel?: string; loginHref?: string; securityHref?: string; navigation?: ReactNode; logout: ReactNode; linkComponent?: NavigationLink;
}) {
  return <>
    {accountEmail ? <div className="header-menu-section header-menu-navigation">{navigation ?? <nav aria-label="Personligt"><Link href={homeHref}>{homeLabel}</Link>{securityHref ? <Link href={securityHref}>Inloggningsinställningar</Link> : null}</nav>}</div> : null}
    <div className="header-menu-section header-menu-account">
      {accountEmail ? <><p className="eyebrow">Konto</p><small className="header-menu-email">{accountEmail}</small>{logout}</> : <Link href={loginHref}>Logga in</Link>}
      <Link href="/components">Komponenter</Link>
    </div>
  </>;
}
