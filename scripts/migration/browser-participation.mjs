import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

// No traces/storage-state files: they would contain Auth cookies or passwords.
const root = process.cwd();
const statePath = process.env.FORENA_BROWSER_SEED_STATE ?? path.join(root, "backend/api/target/browser-seed.json");
const state = JSON.parse(await readFile(statePath, "utf8"));
assert.equal(state.project_ref, "ckzrtxqjskosqzoitymc");
assert.equal(process.env.FORENA_TEST_TARGET_REF, state.project_ref);
assert.ok(!state.cleaned && state.password);
const base = new URL(process.env.FORENA_BROWSER_BASE_URL ?? "http://127.0.0.1:3000");
assert.ok(["127.0.0.1", "localhost"].includes(base.hostname) && base.protocol === "http:");
const output = path.join(root, "backend/api/target/browser-flow");
await mkdir(output, { recursive: true });
const evidencePath = path.join(output, "results.json");
await import("node:fs/promises").then(fs => fs.rm(evidencePath, { force: true }));
const checks = [];
const snapshots = [];
const consoleErrors = [];
const apiResponses = [];
const browser = await chromium.launch({ headless: true, env: Object.fromEntries(Object.entries(process.env).filter(([key, value]) => !key.startsWith("FORENA_") && value !== undefined)) });
let cleanupConfirmed = false;
let passed = false;

function db() {
  const snapshot = JSON.parse(execFileSync("python3", ["backend/api/scripts/browser-seed.py", "snapshot", "--state", statePath], { encoding: "utf8" }));
  snapshots.push(snapshot);
  return snapshot;
}
function invitation(snapshot, key = "invitation0") { return snapshot.invitations.find(row => row.id === state.ids[key]); }
function signal(snapshot) { return snapshot.signals.find(row => row.activity_id === state.ids.activity)?.dirty_revision ?? 0; }
async function login(page, index = 0) {
  await page.goto(new URL("/migration/participation", base).href);
  await expect(page.getByRole("heading", { name: "Logga in", exact: true })).toBeVisible();
  await page.getByLabel("E-postadress", { exact: true }).fill(state.emails[index]);
  await page.getByLabel("Lösenord", { exact: true }).fill(state.password);
  await page.getByRole("button", { name: "Logga in", exact: true }).click();
  await expect(page).toHaveURL(new URL("/migration/participation", base).href);
  await expect(page.getByRole("heading", { name: "Familjens kallelser" })).toBeVisible();
}
async function write(page, id, body, expected = 200) {
  const result = await page.evaluate(async ({ id, body }) => {
    const r = await fetch(`/api/invitations/${id}/respond`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, cache: r.headers.get("cache-control") };
  }, { id, body });
  assert.equal(result.status, expected);
  assert.match(result.cache ?? "", /no-store/);
}
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on("response", response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/api/activities/") || url.pathname.startsWith("/api/invitations/")) {
      apiResponses.push({ method: response.request().method(), path: url.pathname, status: response.status() });
    }
  });
  page.on("pageerror", () => consoleErrors.push("browser-page-error"));
  await login(page);
  const rows = page.locator(".personal-invitation-response");
  await expect(rows).toHaveCount(2);
  await expect(page.getByText("Syntetiskt barn Kim", { exact: true })).toHaveCount(0);
  checks.push("password-login-real-ssr-cookies", "two-children-only");
  const first = rows.filter({ hasText: "Syntetiskt barn Alva" });
  const second = rows.filter({ hasText: "Syntetiskt barn Bo" });
  const before = db();
  assert.equal(before.history.length, 0); assert.equal(signal(before), 0);
  await first.getByLabel("Kommentar").fill("Hämtas senare");
  await first.getByRole("button", { name: "Kommer", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Svaret för Syntetiskt barn Alva har sparats." })).toBeVisible();
  const accepted = db();
  assert.equal(invitation(accepted).response, "accepted"); assert.equal(invitation(accepted).response_comment, "Hämtas senare");
  assert.equal(accepted.history.length, 1); assert.equal(signal(accepted), 1);
  await page.reload();
  await expect(first.getByLabel("Kommentar")).toHaveValue("Hämtas senare");
  await expect(first.getByRole("button", { name: "Kommer", exact: true })).toHaveClass("selected");
  checks.push("accepted-answer-comment-and-reload");
  await first.getByLabel("Kommentar").fill("Ny hämtning");
  await first.getByRole("button", { name: "Spara kommentar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Svaret för Syntetiskt barn Alva har sparats." })).toBeVisible();
  const commented = db();
  assert.equal(invitation(commented).response_comment, "Ny hämtning");
  assert.equal(invitation(commented).responded_at, invitation(accepted).responded_at);
  assert.equal(commented.history.length, 2); assert.equal(signal(commented), 1);
  checks.push("comment-edit-preserves-response-time-and-signal-version");
  await first.getByRole("button", { name: "Kan inte", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Svaret för Syntetiskt barn Alva har sparats." })).toBeVisible();
  const declined = db(); assert.equal(invitation(declined).response, "declined"); assert.equal(signal(declined), 2);
  await first.getByRole("button", { name: "Ta bort svar" }).click();
  await expect(first.getByRole("button", { name: "Ta bort svar" })).toHaveCount(0);
  await page.reload(); await expect(first.getByLabel("Kommentar")).toHaveValue("");
  const cleared = db();
  assert.equal(invitation(cleared).response, "pending"); assert.equal(invitation(cleared).responded_at, null);
  assert.equal(invitation(cleared).response_comment, null); assert.equal(cleared.history.length, 4); assert.equal(signal(cleared), 3);
  checks.push("decline-reset-and-reload");
  // The overview/old client's comment-omitting payload uses the same Next route.
  await write(page, state.ids.invitation1, { response: "accepted", comment: "Behåll" });
  await write(page, state.ids.invitation1, { response: "declined" });
  const quick = db(); assert.equal(invitation(quick, "invitation1").response_comment, "Behåll");
  await write(page, state.ids.invitation1, { response: "declined" });
  assert.deepEqual(db(), quick);
  await page.reload(); await expect(second.getByLabel("Kommentar")).toHaveValue("Behåll");
  checks.push("legacy-quick-payload-preserves-comment", "identical-answer-is-no-op");
  const other = await browser.newContext(); const otherPage = await other.newPage();
  await login(otherPage, 1);
  await expect(otherPage.getByRole("alert")).toBeVisible();
  const foreignRead = await otherPage.evaluate(async id => (await fetch(`/api/activities/${id}/my-invitations`)).status, state.ids.activity);
  assert.equal(foreignRead, 404);
  const unchanged = db();
  await write(otherPage, state.ids.invitation0, { response: "accepted", comment: "Nekad" }, 403);
  assert.deepEqual(db(), unchanged);
  checks.push("other-family-read-and-write-denied-without-history");
  await other.close();
  const staleCookies = (await context.cookies()).filter(c => c.name.startsWith("sb-"));
  assert.ok(staleCookies.length);
  // Mobile and desktop exercise the production shared shell and response panel.
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.screenshot({ path: path.join(output, "family-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, "family-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Öppna meny", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Huvudmeny" });
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape"); await expect(menu).toHaveCount(0);
  await page.getByRole("button", { name: "Öppna meny", exact: true }).click();
  await menu.getByRole("button", { name: "Logga ut från Förena" }).click();
  await expect(page.getByRole("heading", { name: "Logga in", exact: true })).toBeVisible();
  const replay = await browser.newContext();
  await replay.addCookies(staleCookies);
  const readReplay = await replay.request.get(new URL(`/api/activities/${state.ids.activity}/my-invitations`, base).href);
  assert.equal(readReplay.status(), 401);
  const writeReplay = await replay.request.put(new URL(`/api/invitations/${state.ids.invitation0}/respond`, base).href, { data: { response: "accepted" } });
  assert.equal(writeReplay.status(), 401); assert.deepEqual(db(), unchanged);
  checks.push("mobile-desktop-no-overflow", "keyboard-menu", "logout-stale-cookies-read-write-denied-without-history");
  await replay.close();
  await login(page);
  await expect(rows).toHaveCount(2);
  const apiPid = Number(process.env.FORENA_BROWSER_API_PID);
  assert.ok(Number.isInteger(apiPid) && apiPid > 1, "Supply this test's Kotlin child PID for the outage check");
  process.kill(apiPid, "SIGTERM");
  for (let i = 0; i < 20; i++) {
    try { await fetch("http://127.0.0.1:8080/actuator/health", { signal: AbortSignal.timeout(500) }); }
    catch { break; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const outageRead = await page.evaluate(async id => (await fetch(`/api/activities/${id}/my-invitations`)).status, state.ids.activity);
  assert.equal(outageRead, 503);
  await write(page, state.ids.invitation0, { response: "accepted" }, 503);
  assert.deepEqual(db(), unchanged);
  checks.push("relogin", "upstream-outage-no-legacy-fallback-or-database-change");
  await context.close();
  const galleryContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const galleryPage = await galleryContext.newPage();
  await galleryPage.goto(new URL("/components", base).href);
  await expect(galleryPage.getByRole("heading", { name: "Avskalad kontomeny" })).toBeVisible();
  assert.ok(await galleryPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await galleryContext.close();
  checks.push("shared-menu-component-reference");
  assert.deepEqual(consoleErrors, []);
  passed = true;
} catch (error) {
  await writeFile(path.join(output, "attempt.json"), JSON.stringify({ passed: false, checks, api_responses: apiResponses }, null, 2));
  throw error;
} finally {
  await browser.close();
  execFileSync("python3", ["backend/api/scripts/browser-seed.py", "cleanup", "--state", statePath], { stdio: "pipe" });
  const final = JSON.parse(execFileSync("python3", ["backend/api/scripts/browser-seed.py", "snapshot", "--state", statePath], { encoding: "utf8" }));
  assert.deepEqual(final, { invitations: [], history: [], signals: [] });
  cleanupConfirmed = true;
}
assert.ok(passed && cleanupConfirmed);
await writeFile(evidencePath, JSON.stringify({ project_ref: state.project_ref, checked_at: new Date().toISOString(), passed, checks, cleanup_confirmed: cleanupConfirmed, snapshots, not_tested: ["browser-pkce", "passkeys", "email-delivery", "oauth-mcp", "full-signal-worker", "deployed-runtime", "ordinary-dashboard-id-loading"] }, null, 2) + "\n");
console.log(JSON.stringify({ passed, checks: checks.length, cleanup_confirmed: cleanupConfirmed }));
