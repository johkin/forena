import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { TeamOverview } from "./team-overview";
import { activity } from "@/data/demo";

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
