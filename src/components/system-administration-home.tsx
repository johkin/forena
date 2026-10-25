import type { NavigationLink } from "./navigation-link";

const sections = [
  { href: "/system/organizations", title: "Klubbar", description: "Skapa klubbar med en första sektion och hantera klubbarnas struktur." },
  { href: "/system/administrators", title: "Administratörer", description: "Bjud in och se plattformens systemadministratörer." },
  { href: "/system/disciplines", title: "Discipliner", description: "Fotboll, innebandy, teater och andra verksamhetsdomäner." },
  { href: "/system/activity-types", title: "Aktivitetstyper", description: "Discipliner och standardvärden för nya aktiviteter." },
  { href: "/system/memories", title: "Assistentminnen", description: "Generella och disciplinspecifika minnen som gäller hela Förena." },
];

/** The canonical Next overview, shared without a separate pilot layout. */
export function SystemAdministrationHome({ linkComponent: Link = "a" }: { linkComponent?: NavigationLink }) {
  return <div className="application-card"><p className="eyebrow">Förena · System</p><h1>Systemadministration</h1>
    <p>Hantera plattformsgemensam konfiguration. Klubbarnas uppgifter och sektioner hanteras här; klubbadministratörer har även egen administration i föreningen.</p>
    <div className="system-admin-grid">{sections.map(section => <Link key={section.href} href={section.href}>
      <strong>{section.title}</strong><span>{section.description}</span>
    </Link>)}</div>
  </div>;
}
