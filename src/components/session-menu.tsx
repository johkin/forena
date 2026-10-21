import type { ReactNode } from "react";

export function SessionMenu({ accountEmail, homeHref = "/", loginHref = "/login", navigation, logout }: {
  accountEmail?: string; homeHref?: string; loginHref?: string; navigation?: ReactNode; logout: ReactNode;
}) {
  return <>
    {accountEmail ? <div className="header-menu-section">{navigation ?? <nav aria-label="Personligt"><a href={homeHref}>Mina aktiviteter</a></nav>}</div> : null}
    <div className="header-menu-section header-menu-account">
      {accountEmail ? <><p className="eyebrow">Konto</p><small className="header-menu-email">{accountEmail}</small>{logout}</> : <a href={loginHref}>Logga in</a>}
      <a href="/components">Komponenter</a>
    </div>
  </>;
}
