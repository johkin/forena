import { expect, it } from "vitest";
import { createTelegramEnrollment, verifyTelegramEnrollment } from "./telegram-enrollment";
const secret = "secret_for_tests_only_".repeat(2);
const now = Date.UTC(2026, 9, 16);
it("authenticates the Telegram sender and expires the routing proof after ten minutes", () => {
  const proof = createTelegramEnrollment("123", "42", secret, now);
  expect(verifyTelegramEnrollment(proof, secret, now)).toBe("123");
  expect(verifyTelegramEnrollment(proof, secret, now + 599999)).toBe("123");
  expect(verifyTelegramEnrollment(proof, secret, now + 600000)).toBeNull();
  expect(verifyTelegramEnrollment(proof, secret, now - 1000)).toBeNull();
  expect(verifyTelegramEnrollment(proof.replace("123.", "456."), secret, now)).toBeNull();
  expect(verifyTelegramEnrollment(proof, "another_secret_".repeat(3), now)).toBeNull();
  expect(verifyTelegramEnrollment(proof, "", now)).toBeNull();
  for (const invalid of [null, {}, "", "123.abc", "x".repeat(10000)]) expect(verifyTelegramEnrollment(invalid, secret, now)).toBeNull();
});
