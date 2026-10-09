import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { PersonalDashboardData } from "@/data/personal-dashboard";
import { PersonalDashboard } from "./personal-dashboard";
import { TeamCalendar } from "./team-calendar";
import { organization, team, activity, members } from "@/data/demo";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ refresh: vi.fn() }) }));

it("renders a neutral personal home with grouped family activities, club labels and team roles", () => {
  const otherOrganization = { ...organization, id: "aik", slug: "aik", name: "AIK Innebandy" };
  const otherTeam = { ...team, id: "floorball", organizationId: "aik", slug: "f2013", name: "F2013" };
  const data: PersonalDashboardData = {
    accountEmail: "parent@example.test", referenceTime: "2020-01-01T00:00:00Z",
    organizations: [organization, otherOrganization],
    teams: [{ organization, team, roles: ["Målsman", "Ledare"] }, { organization: otherOrganization, team: otherTeam, roles: ["Målsman"] }],
    activities: [
      { organization, team, activity, member: members[0], invitation: { id: "i", organizationId: organization.id, activityId: activity.id, memberId: members[0].id, response: "pending" } },
      { organization, team, activity, member: members[1], hasDutyAssignment: true },
      { organization: otherOrganization, team: otherTeam, activity: { ...activity, id: "floorball-activity" }, member: members[2], hasDutyAssignment: true },
    ],
  };
  const html = renderToStaticMarkup(<PersonalDashboard data={data} />);
  expect(html).toContain("Min översikt");
  expect(html).toContain("Behöver svar");
  expect(html).toContain("Kommande aktiviteter");
  expect(html).toContain("Mina lag och föreningar");
  expect(html).toContain("AIK Innebandy · F2013");
  expect(html).toContain('href="/o/aik/t/f2013"');
  expect(html).toContain("Målsman · Ledare");
  expect(html).toContain('href="/" aria-current="page"');
  expect(html.match(/class="personal-activity-row"/g)).toHaveLength(3); // One needs reply, two distinct upcoming activities.
  expect(html.match(/class="personal-activity-person"/g)).toHaveLength(4);
  expect(html).not.toContain('class="assistant-launcher"');
});
it("renders useful empty states without choosing a default club", () => {
  const html = renderToStaticMarkup(<PersonalDashboard data={{ accountEmail: "new@example.test", referenceTime: "2030-01-01T00:00:00Z", activities: [], teams: [], organizations: [] }} />);
  expect(html).toContain("Du är inte ansluten till någon förening ännu");
  expect(html).toContain("Inga kommande kallelser");
  expect(html).not.toContain("Ursvik");
});
it.each([
  ["owner", "Ägare"], ["admin", "Föreningsadministratör"], ["leader", "Ledare"], ["member", "Medlem"],
] as const)("shows the %s organization role without any team role", (role, label) => {
  const html = renderToStaticMarkup(<PersonalDashboard data={{ accountEmail: "member@example.test", referenceTime: "2030-01-01T00:00:00Z", activities: [], teams: [], organizations: [{ ...organization, role }] }} />);
  expect(html).toContain(`class="personal-organization-role">${label}</p>`);
  expect(html).toContain(`href="/o/${organization.slug}"`);
});
it("does not invent an organization role for a guardian-only organization link", () => {
  const html = renderToStaticMarkup(<PersonalDashboard data={{ accountEmail: "guardian@example.test", referenceTime: "2030-01-01T00:00:00Z", activities: [], teams: [], organizations: [organization] }} />);
  expect(html).not.toContain('class="personal-organization-role"');
});
it("shows every family event even when more than four share a day, with contextual accessible labels", () => {
  const events = Array.from({ length: 6 }, (_, index) => ({ ...activity, id: `a${index}`, title: `Match ${index}` }));
  const html = renderToStaticMarkup(<TeamCalendar activities={events} timeZone="Europe/Stockholm" heading="Familjens kalender" showAllEvents eventLabel={item => `${item.title} · AIK · Elsa`} onSelectActivity={() => {}} />);
  expect(html).toContain("Familjens kalender");
  expect(html).toContain("Match 5 · AIK · Elsa");
  expect(html).not.toContain("+2 till");
  expect(html.match(/class="calendar-event"/g)).toHaveLength(6);
});
