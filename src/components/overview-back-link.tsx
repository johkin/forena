import type { NavigationLink } from "./navigation-link";

export function OverviewBackLink({ linkComponent: Link = "a" }: { linkComponent?: NavigationLink }) {
  return <Link href="/" className="overview-back-link"><span aria-hidden="true">←</span> Till min översikt</Link>;
}
