import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ActivityCapacity } from "./activity-capacity";

it("omits unlimited activities and keeps actual overbooking text while capping the visual bar", () => {
  expect(renderToStaticMarkup(<ActivityCapacity accepted={5} />)).toBe("");
  const partial = renderToStaticMarkup(<ActivityCapacity maximum={10} accepted={8} />);
  expect(partial).toContain("8 av 10 platser");
  expect(partial).toContain('value="8"');
  const overbooked = renderToStaticMarkup(<ActivityCapacity maximum={10} accepted={12} />);
  expect(overbooked).toContain("12 av 10 platser · Överbelagd aktivitet");
  expect(overbooked).toContain('value="10"');
});
