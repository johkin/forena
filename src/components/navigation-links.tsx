"use client";

import { usePathname } from "next/navigation";
import { NavigationLinksView, type NavigationItem } from "./navigation-links-view";

export type { NavigationItem } from "./navigation-links-view";

export function NavigationLinks({ items, label }: { items: NavigationItem[]; label: string }) {
  const pathname = usePathname();
  return <NavigationLinksView items={items} label={label} pathname={pathname} />;
}
