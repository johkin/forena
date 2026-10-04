"use client";

import type { ReactNode } from "react";
import { AppHeader, AppMenuContent, type AppHeaderProps } from "@/components/app-header";

/** One menu definition, shown in the sidebar or mobile drawer. */
export function AppShell({ children, ...props }: AppHeaderProps & { children: ReactNode }) {
  return <>
    <AppHeader {...props} sidebarNavigation />
    <div className="shell app-shell">
      <aside className="sidebar app-sidebar" aria-label="Huvudmeny"><AppMenuContent {...props} /></aside>
      {children}
    </div>
  </>;
}
