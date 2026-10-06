import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ActivityDetailModal } from "./activity-detail-modal";
import type { Activity, Organization, Team } from "@/domain/club";
const now = Date.parse("2026-10-07T12:00:00Z");
const activity = { id: "activity", title: "Träning", startsAt: "2026-10-07T10:00:00Z", endsAt: "2026-10-07T11:00:00Z", status: "published" } as Activity;
function render(overrides: Partial<Activity> = {}, canManageAttendance = true) {
  vi.spyOn(Date, "now").mockReturnValue(now);
  try { return renderToStaticMarkup(<ActivityDetailModal activity={{ ...activity, ...overrides }} organization={{ timeZone: "Europe/Stockholm" } as Organization} team={{ name: "F2016" } as Team} canManageActivity canManageInvitations={false} canManageAttendance={canManageAttendance} rosterMembers={[]} onClose={() => {}} onEdit={() => {}} />); }
  finally { vi.restoreAllMocks(); }
}
it("shows past activities read-only while retaining authorized attendance correction", () => {
  const html = render();expect(html).toContain("läsläge");expect(html).not.toContain("Redigera aktivitet");expect(html).toContain("Justera närvaro");
  expect(render({}, false)).not.toContain("Justera närvaro");
});
it("allows editing until the activity has ended", () => {
  const html = render({ endsAt: "2026-10-07T13:00:00Z" });expect(html).toContain("Redigera aktivitet");expect(html).toContain("Rapportera närvaro");expect(html).not.toContain("läsläge");
});
it("does not offer editing or attendance reporting on a cancelled activity", () => {
  const html = render({ status: "cancelled" });expect(html).not.toContain("Redigera aktivitet");expect(html).not.toContain("Justera närvaro");
});
