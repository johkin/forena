import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { organization, team } from "@/data/demo";
vi.mock("next/navigation", () => ({ usePathname: () => "/system/disciplines", useRouter: () => ({ refresh: vi.fn() }) }));
import { AppShell } from "./app-shell";
import { AppFooter } from "./app-footer";
import { SystemNavigation } from "./system-navigation";
import { ClubDashboard } from "./club-dashboard";
import { section } from "@/data/demo";

it.each(["organization", "section", "team"])("shows one floating assistant in the authenticated %s shell", scope => {
  const html = renderToStaticMarkup(<AppShell organization={organization} team={scope === "team" ? team : undefined} assistantSection={scope === "section" ? section : undefined} accountEmail="member@test.example"><main>Innehåll</main></AppShell>);
  expect(html.match(/class="assistant-launcher"/g)).toHaveLength(1);
  expect(html).toContain('aria-haspopup="dialog"');
});

it("renders one header and footer with an active protected system menu", () => {
  const html = renderToStaticMarkup(<><AppShell homeHref="/system" accountEmail="admin@test.example" navigation={<SystemNavigation />}><main>Discipliner</main></AppShell><AppFooter /></>);
  expect(html.match(/<header\b/g)).toHaveLength(1);
  expect(html.match(/<footer\b/g)).toHaveLength(1);
  expect(html).toContain('href="/system/disciplines" aria-current="page"');
  expect(html).toContain("Min profil");
  expect(html).not.toContain(">Logga in</a>");
});
it.each([false, true])("keeps the assistant and authorized create action for an empty team; activity.manage=%s", canCreate => {
  const html = renderToStaticMarkup(<ClubDashboard organization={organization} sections={[]} team={team} activity={null}
    members={[]} rosterMembers={[]} upcomingActivities={[]} initialInvitations={[]} initialFamilyActivities={[]}
    workspaces={[]} tasks={[]} teamPermissions={canCreate ? ["team.view", "activity.manage"] : []}
    canAdministerOrganization={false} accountEmail="member@test.example" respondablePersonIds={[]}
    referenceTime="2026-10-06T10:00:00Z" missingAttendanceActivities={[]} source="database" />);
  expect(html).toContain('class="assistant-launcher"');
  expect(html.includes("+ Ny aktivitet")).toBe(canCreate);
  expect(html).not.toContain("Publicerade aktiviteter och matcher för laget");
  expect(html).not.toContain("Administrera ledare och roller");
});
it("keeps public account links and the destination without administrative links", () => {
  const html = renderToStaticMarkup(<AppShell homeHref="/o/test" organization={organization} loginHref="/login?next=%2Fo%2Ftest"><main>Publik vy</main></AppShell>);
  expect(html).toContain('href="/login?next=%2Fo%2Ftest"');
  expect(html).not.toContain("Administrera ledare och roller");
  expect(html).not.toContain("Min profil");
  expect(html).not.toContain('class="assistant-launcher"');
});
