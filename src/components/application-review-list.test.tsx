import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ApplicationReviewList, type ApplicationListItem } from "./application-review-list";
const application: ApplicationListItem = {
  id: "application", playerName: "Test Spelare", birthDate: "2016-05-01", sectionName: "Fotboll", teamName: "F2016",
  guardians: [], previousClub: "", message: "", reviewStatus: "submitted", activationStatus: "not_started",
  createdAt: "2026-10-06T10:00:00Z", source: "public_form", verifiedAt: "2026-10-06T10:01:00Z",
  verifiedEmail: "test@example.se", reviewedAt: "2026-10-06T10:02:00Z", timeZone: "Europe/Stockholm",
};
it("formats office dates in the club's local timezone", () => {
  const html = renderToStaticMarkup(<ApplicationReviewList initialApplications={[application]} />);
  expect(html).toContain("2026-10-06 12:00");
});
it.each([
  { createdAt: "invalid-timestamp" }, { timeZone: "invalid-timezone" },
  { verifiedAt: "invalid-timestamp" }, { reviewedAt: "invalid-timestamp" },
])("keeps the list usable when a row has invalid date metadata: %j", overrides => {
  const html = renderToStaticMarkup(<ApplicationReviewList initialApplications={[{ ...application, ...overrides }]} />);
  expect(html).toContain("Test Spelare");
  expect(html).toContain(overrides.timeZone ? application.createdAt : "invalid-timestamp");
  expect(html).toContain("Godkänn och skicka länkar");
});
