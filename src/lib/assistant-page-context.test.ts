import { expect, it } from "vitest";
import { assistantPageContext } from "./assistant-page-context";

it("uses route labels without copying sensitive page content", () => {
  expect(assistantPageContext("/o/uik/t/f2016/members", "uik", "F2016")).toEqual({ sectionSlug: undefined, page: { path: "/o/uik/t/f2016/members", title: "Truppen" } });
  expect(assistantPageContext("/o/uik/s/football", "uik")?.sectionSlug).toBe("football");
  expect(assistantPageContext("/o/another/memories", "uik")).toBeUndefined();
  expect(assistantPageContext("/o/uik-other/memories", "uik")).toBeUndefined();
});
