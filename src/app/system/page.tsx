import { NextNavigationLink } from "@/components/next-navigation-link";
import { SystemAdministrationHome } from "@/components/system-administration-home";

export default function SystemPage() {
  return <main className="application-page"><SystemAdministrationHome linkComponent={NextNavigationLink} /></main>;
}
