"use client";

import { AppShellFrame } from "./app-shell-frame";
import { FloatingAssistant, type FloatingAssistantOptions } from "./floating-assistant";
import type { Section } from "@/domain/club";
import type { ReactNode } from "react";
import { AppHeader, AppMenuContent, type AppHeaderProps } from "@/components/app-header";

/** One menu definition, shown in the sidebar or mobile drawer. */
export function AppShell({ children, assistantSection, assistantOptions, ...props }: AppHeaderProps & { children: ReactNode; assistantSection?: Section; assistantOptions?: FloatingAssistantOptions }) {
  return <><AppShellFrame header={<AppHeader {...props} sidebarNavigation />} sidebar={<AppMenuContent {...props} />} hasAssistant={Boolean(props.accountEmail && props.organization)}>
    {children}
  </AppShellFrame>
    {props.accountEmail && props.organization ? <FloatingAssistant organization={props.organization} team={props.team} section={assistantSection} options={assistantOptions} /> : null}
  </>;
}
