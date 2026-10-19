import type { ReactNode } from "react";

/** Shared page structure; callers supply their own routing/auth menu contents. */
export function AppShellFrame({ header, sidebar, children, hasAssistant = false }: {
  header: ReactNode; sidebar: ReactNode; children: ReactNode; hasAssistant?: boolean;
}) {
  return <>{header}<div className={`shell app-shell${hasAssistant ? " has-assistant" : ""}`}>
    <aside className="sidebar app-sidebar" aria-label="Huvudmeny">{sidebar}</aside>
    {children}
  </div></>;
}
