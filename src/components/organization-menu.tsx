import { NavigationLinks } from "./navigation-links";

export function OrganizationMenu({ organizationSlug, canAdminister = false }: {
  organizationSlug: string; canAdminister?: boolean;
}) {
  const base = `/o/${organizationSlug}`;
  return <NavigationLinks label="Förening" items={[
    { href: base, label: "Föreningsöversikt" },
    { href: `${base}/join`, label: "Ansök om medlemskap" },
    ...(canAdminister ? [{ href: `${base}/applications`, label: "Medlemsansökningar" }] : []),
    ...(canAdminister ? [{ href: `${base}/admin/roles`, label: "Administrera ledare och roller" }] : []),
  ]} />;
}
