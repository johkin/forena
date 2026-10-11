import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { z } from "zod";

it("uses canonical stored GUIDs throughout the batch security fixture", () => {
  const sql = readFileSync("supabase/tests/activity_duty_batch_test.sql", "utf8");
  const ids = [...sql.matchAll(/[a-f][0-9a-f-]{20,}/g)].map(match => match[0]);
  expect(ids.length).toBeGreaterThan(50);
  for (const id of ids) expect(z.guid().safeParse(id).success, id).toBe(true);
});
