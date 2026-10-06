"use client";

import { usePathname } from "next/navigation";

export type NavigationItem = { href: string; label: string };

export function NavigationLinks({ items, label }: { items: NavigationItem[]; label: string }) {
  const pathname = usePathname();
  return <nav aria-label={label}>{items.map(item => <a key={item.href} href={item.href}
    aria-current={item.href === pathname ? "page" : undefined}>{item.label}</a>)}</nav>;
}
