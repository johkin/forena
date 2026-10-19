import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

// Only synthetic accounts from browser-seed.py. Never persist tokens or traces.
const statePath = process.env.FORENA_BROWSER_SEED_STATE ?? "backend/api/target/browser-seed.json";
const state = JSON.parse(await readFile(statePath, "utf8"));
assert.equal(state.project_ref, "ckzrtxqjskosqzoitymc");
assert.equal(process.env.FORENA_TEST_TARGET_REF, state.project_ref);
assert.ok(!state.cleaned && state.password);
const output = "backend/api/target/browser-flow";
const base = "http://127.0.0.1:3000";
const activityPath = `/activities/${state.ids.activity}`;
const checks = [];
const browser = await chromium.launch({ headless: true,
  ...(process.env.FORENA_BROWSER_EXECUTABLE ? { executablePath: process.env.FORENA_BROWSER_EXECUTABLE } : {}),
  env: Object.fromEntries(Object.entries(process.env).filter(([key, value]) => !key.startsWith("FORENA_") && value !== undefined)),
});
const db = () => JSON.parse(execFileSync("python3", ["backend/api/scripts/browser-seed.py", "snapshot", "--state", statePath], { encoding: "utf8" }));
const invitation = snapshot => snapshot.invitations.find(row => row.id === state.ids.invitation0);
const sessionToken = page => page.evaluate(() => JSON.parse(localStorage.getItem("forena-kotlin-browser-auth") ?? "null")?.access_token);
async function login(page, index = 0) {
  await page.goto(base + activityPath);
  await expect(page.getByRole("heading", { name: "Logga in", exact: true })).toBeVisible();
  await page.getByLabel("E-postadress", { exact: true }).fill(state.emails[index]);
  await page.getByLabel("Lösenord", { exact: true }).fill(state.password);
  await page.getByRole("button", { name: "Logga in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Familjens kallelser" })).toBeVisible();
}
async function write(page, id, response) {
  return page.evaluate(async ({ id, response }) => {
    const token = JSON.parse(localStorage.getItem("forena-kotlin-browser-auth"))?.access_token;
    return (await fetch(`/api/invitations/${id}/respond`, {
      method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ response }), cache: "no-store", credentials: "omit",
    })).status;
  }, { id, response });
}
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [], apiRequests = [];
  page.on("pageerror", () => errors.push("page-error"));
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request); });
  await login(page);
  const rows = page.locator(".personal-invitation-response");
  await expect(rows).toHaveCount(2);
  const first = rows.filter({ hasText: "Syntetiskt barn Alva" });
  await first.getByLabel("Kommentar").fill("Hämtas senare");
  await first.getByRole("button", { name: "Kommer", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "har sparats" })).toBeVisible();
  assert.equal(invitation(db()).response, "accepted");
  assert.equal(invitation(db()).response_comment, "Hämtas senare");
  await page.reload();
  await expect(first.getByLabel("Kommentar")).toHaveValue("Hämtas senare");
  await first.getByRole("button", { name: "Kan inte", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "har sparats" })).toBeVisible();
  assert.equal(invitation(db()).response, "declined");
  await first.getByRole("button", { name: "Ta bort svar", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "har sparats" })).toBeVisible();
  assert.equal(invitation(db()).response, "pending");
  assert.ok(apiRequests.length > 0 && apiRequests.every(request => request.headers().authorization?.startsWith("Bearer ") && !request.headers().cookie));
  checks.push("browser-auth-bearer-direct-kotlin", "two-children", "answer-comment-reload-decline-reset-real-database");

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await login(otherPage, 1);
  await expect(otherPage.locator(".personal-invitation-response")).toHaveCount(0);
  const unchanged = db();
  assert.equal(await write(otherPage, state.ids.invitation0, "accepted"), 404);
  assert.deepEqual(db(), unchanged);
  await other.close();
  checks.push("other-family-read-write-isolation");

  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.screenshot({ path: `${output}/spa-family-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/spa-family-mobile.png`, fullPage: true });
  const staleToken = await sessionToken(page);
  await page.getByRole("button", { name: "Öppna meny", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Huvudmeny" });
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape"); await expect(menu).toHaveCount(0);
  await page.getByRole("button", { name: "Öppna meny", exact: true }).click();
  await menu.getByRole("button", { name: "Logga ut från Förena" }).click();
  await expect(page.getByRole("heading", { name: "Logga in", exact: true })).toBeVisible();
  await expect(page.locator(".personal-invitation-response")).toHaveCount(0);
  const replay = await context.request.get(`${base}/api/activities/${state.ids.activity}/my-invitations`, { headers: { Authorization: `Bearer ${staleToken}` } });
  assert.equal(replay.status(), 401);
  assert.deepEqual(db(), unchanged);
  checks.push("mobile-desktop-keyboard", "logout-clears-private-ui-and-revokes-session");
  await page.goto(base + "/components");
  await expect(page.getByRole("heading", { name: "Komponenter", exact: true })).toBeVisible();
  await expect(page.getByText("Alex Exempel", { exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  checks.push("shared-component-reference");
  await context.close();
} finally {
  await browser.close();
  execFileSync("python3", ["backend/api/scripts/browser-seed.py", "cleanup", "--state", statePath], { stdio: "pipe" });
}
assert.equal(JSON.parse(await readFile(statePath, "utf8")).cleaned, true);
await writeFile(`${output}/results.json`, JSON.stringify({ passed: true, checks, cleanup_confirmed: true, not_tested: ["deployed-runtime", "signup", "password-recovery", "passkeys", "ordinary-dashboard"] }, null, 2) + "\n");
console.log(JSON.stringify({ passed: true, checks: checks.length, cleanup_confirmed: true }));
