import type { NavigationLink } from "./navigation-link";

export type NavigationItem = { href: string; label: string };

/** Shared menu markup; each application supplies its current route and link adapter. */
export function NavigationLinksView({ items, label, pathname, linkComponent: Link = "a" }: {
  items: readonly NavigationItem[]; label: string; pathname: string; linkComponent?: NavigationLink;
}) {
  return <nav aria-label={label}>{items.map(item => <Link key={item.href} href={item.href}
    aria-current={item.href === pathname ? "page" : undefined}>{item.label}</Link>)}</nav>;
}
