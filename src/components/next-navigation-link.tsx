"use client";

import Link from "next/link";
import type { AnchorHTMLAttributes } from "react";

export function NextNavigationLink({ href = "/", ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <Link href={href} {...props} />;
}
