import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { clubStructureSchema } from "@/lib/club-administration";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/app/club-administration-actions", () => ({ saveClub: vi.fn(), saveSection: vi.fn(), deleteSection: vi.fn() }));
vi.mock("./club-slug-field", () => ({ ClubSlugField: () => null }));
vi.mock("./time-zone-select", () => ({ TimeZoneSelect: () => null }));
import { ClubAdministration } from "./club-administration";

function sectionForm(canChangeDiscipline: boolean, teamCount: number) {
  const structure = clubStructureSchema.parse({
    organization: { id: "10000000-0000-0000-0000-000000000001", slug: "uik", name: "UIK", assistantName: "A", timeZone: "Europe/Stockholm" },
    sections: [{ id: "20000000-0000-0000-0000-000000000001", slug: "football", name: "Fotboll", disciplineId: "football", canChangeDiscipline, teamCount }],
  });
  return renderToStaticMarkup(ClubAdministration({ structure, disciplines: [{ id: "football", name: "Fotboll" }] })).split('name="sectionId"')[1].split("</form>")[0];
}
it.each([0, 1])("retains the discipline for name changes while disabling a locked section with %s teams", teamCount => {
  const html = sectionForm(false, teamCount);
  expect(html).toContain('<input type="hidden" name="disciplineId" value="football"');
  expect(html).toMatch(/<select[^>]*name="disciplineId"[^>]*disabled=""/);
  expect(html).toContain("Disciplinen är låst");
  expect(html).toContain("Spara sektion");
});
it("keeps discipline selection available for an unused section without duplicate submitted fields", () => {
  const html = sectionForm(true, 0);
  expect(html).not.toContain('type="hidden" name="disciplineId"');
  expect(html).not.toContain('disabled=""');
  expect(html).not.toContain("Disciplinen är låst");
});
