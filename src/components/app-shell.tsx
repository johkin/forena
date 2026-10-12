"use client";

import { FloatingAssistant, type FloatingAssistantOptions } from "./floating-assistant";
import type { Section } from "@/domain/club";
import type { ReactNode } from "react";
import { AppHeader, AppMenuContent, type AppHeaderProps } from "@/components/app-header";

/** One menu definition, shown in the sidebar or mobile drawer. */
export function AppShell({ children, assistantSection, assistantOptions, ...props }: AppHeaderProps & { children: ReactNode; assistantSection?: Section; assistantOptions?: FloatingAssistantOptions }) {
  return <>
    <AppHeader {...props} sidebarNavigation />
    <div className={`shell app-shell${props.accountEmail && props.organization ? " has-assistant" : ""}`}>
      <aside className="sidebar app-sidebar" aria-label="Huvudmeny"><AppMenuContent {...props} /></aside>
      {children}
    </div>
    {props.accountEmail && props.organization ? <FloatingAssistant organization={props.organization} team={props.team} section={assistantSection} options={assistantOptions} /> : null}
  </>;
}
