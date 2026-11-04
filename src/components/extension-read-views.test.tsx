import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ExtensionReadView,
  readContributionSchema,
} from "./extension-read-views";
import { sampleReadContribution } from "./player-evaluation-examples";

describe("server-described read views", () => {
  it("uses the same validated renderers for independent capabilities", () => {
    for (const capabilityKey of ["playerEvaluation", "independent-example"]) {
      const contribution = readContributionSchema.parse({
        ...sampleReadContribution,
        capabilityKey,
      });
      const html = contribution.views
        .map((view) => renderToStaticMarkup(<ExtensionReadView view={view} />))
        .join("");
      expect(html).toContain("Alex Exempel");
      expect(html).toContain("Saknar bedömning");
      expect(html).toContain("Kan prova nästa förmågegrupp");
      expect(html).toContain('scope="col"');
      expect(html).toContain('scope="row"');
    }
  });
  it("rejects incompatible versions, unknown views and invalid numbers", () => {
    expect(
      readContributionSchema.safeParse({
        ...sampleReadContribution,
        schemaVersion: 2,
      }).success,
    ).toBe(false);
    expect(
      readContributionSchema.safeParse({
        ...sampleReadContribution,
        views: [{ type: "execute", code: "alert(1)" }],
      }).success,
    ).toBe(false);
    expect(
      readContributionSchema.safeParse({
        ...sampleReadContribution,
        views: [
          {
            type: "list",
            title: "Broken",
            columns: [],
            rows: [
              {
                id: "1",
                cells: { value: { type: "number", number: "9" } },
                markers: [],
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
