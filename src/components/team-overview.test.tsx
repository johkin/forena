import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { TeamOverview } from "./team-overview";
import { activity } from "@/data/demo";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

it("shows capability actions and history only to invitation managers without a duplicate reminder row", () => {
  const props = { teamName: "F2016", activity, summary: { accepted: 6, declined: 0, pending: 4 }, upcomingActivities: [activity],
    tasks: [], timeZone: "Europe/Stockholm", referenceTime: "2026-10-06T10:00:00Z", reminderPending: false,
    canManageAttendance: false, onOpenActivity: vi.fn(), onOpenAttendance: vi.fn(), onSendReminder: vi.fn(),
    signals: [{ id: "signal", activityId: activity.id, revision: 1, severity: "warning" as const,
      title: "Få spelare anmälda", text: "6 av önskade 9 spelare", capabilityId: "targetTeamSize", type: "team_size_shortage",
      evaluatedAt: "2026-10-06T10:00:00Z", facts: { acceptedPlayers: 6, targetTeamSize: 9 },
      actions: [{ id: "invite-more-players" as const, label: "Kalla fler spelare" }],
      lastAction: { id: "remind-unanswered", createdAt: "2026-10-06T09:30:00Z", result: { status: "queued" } } }],
  };
  const allowed = renderToStaticMarkup(<TeamOverview {...props} canManageInvitations />);
  expect(allowed).toContain("Få spelare anmälda");
  expect(allowed).toContain("Kalla fler spelare");
  expect(allowed).toContain("Påminnelse köad");
  expect(allowed).not.toContain("Skicka påminnelse");
  const denied = renderToStaticMarkup(<TeamOverview {...props} canManageInvitations={false} />);
  expect(denied).not.toContain("Få spelare anmälda");
  expect(denied).not.toContain("Påminnelse köad");
});

it("renders a real empty state while preserving historical attendance and tasks", () => {
  const html = renderToStaticMarkup(<TeamOverview teamName="Empty team" activity={null}
    summary={{ accepted: 0, declined: 0, pending: 0 }} upcomingActivities={[]}
    tasks={[{ id: "task", organizationId: "org", teamId: "team", title: "Book pitch", description: "", dueAt: "2026-12-01T10:00:00Z", status: "open", createdByLabel: "Office" }]}
    timeZone="Europe/Stockholm" referenceTime="2026-10-06T10:00:00Z" reminderPending={false}
    canManageInvitations canManageAttendance missingAttendanceActivities={[activity]}
    onOpenActivity={vi.fn()} onOpenAttendance={vi.fn()} onSendReminder={vi.fn()} />);
  expect(html).toContain("Laget har inga kommande aktiviteter.");
  expect(html).toContain("Rapportera närvaro:");
  expect(html).toContain("Book pitch");
  expect(html).not.toContain("Nästa aktivitet");
  expect(html).not.toContain("Skicka påminnelse");
});
