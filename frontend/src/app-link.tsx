import type { AnchorHTMLAttributes } from "react";
import { Link } from "react-router";

export function AppLink({ href = "/", ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <Link {...props} to={href} reloadDocument={props.download !== undefined} />;
}
