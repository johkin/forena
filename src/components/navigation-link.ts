import type { AnchorHTMLAttributes, ComponentType } from "react";

/** Routing adapter supplied by the host app; shared components default to anchors. */
export type NavigationLink = ComponentType<AnchorHTMLAttributes<HTMLAnchorElement>> | "a";
