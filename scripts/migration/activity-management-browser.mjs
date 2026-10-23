import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const origin = 'https://app.example.invalid';
const backend = process.env.FORENA_M09_API;
const frontend = process.env.FORENA_M09_FRONTEND ?? 'http://localhost:3002';
for (const endpoint of [backend, frontend]) assert.ok(['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname));
const browser = await chromium.launch({ headless: true,
  ...(process.env.FORENA_BROWSER_EXECUTABLE ? { executablePath: process.env.FORENA_BROWSER_EXECUTABLE } : {}),
  env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('FORENA_'))),
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
let writes = 0;
let clubCreates = 0;
let lastCreatedTeamId;
await context.route('**/*', async route => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin !== origin) return route.abort();
  const headers = { ...await request.allHeaders() };
  delete headers.host;
  delete headers['content-length'];
  if (url.pathname.startsWith('/api/admin/') && request.method() !== 'GET') console.log('ADMIN COMMAND', request.method(), url.pathname);
  if (url.pathname === '/api/admin/clubs' && request.method() === 'POST') clubCreates++;
  if (url.pathname.startsWith('/api/activities') && request.method() !== 'GET') writes++;
  const api = url.pathname.startsWith('/api/');
  const response = await fetch(new URL(url.pathname + url.search, api ? backend : frontend), {
    method: request.method(), headers, redirect: 'manual',
    body: ['GET', 'HEAD'].includes(request.method()) ? undefined : request.postDataBuffer(),
  });
  if (/\/api\/admin\/sections\/[^/]+\/teams$/.test(url.pathname) && request.method() === 'POST' && response.ok) {
    lastCreatedTeamId = (await response.clone().json()).id;
  }
  if (api && response.status >= 400) console.log('API', request.method(), url.pathname, response.status);
  const output = Object.fromEntries(response.headers.entries());
  for (const name of ['content-length', 'content-encoding', 'transfer-encoding']) delete output[name];
  if (response.headers.getSetCookie().length) output['set-cookie'] = response.headers.getSetCookie().join('\n');
  await route.fulfill({ status: response.status, headers: output, body: Buffer.from(await response.arrayBuffer()) });
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('frontend/.evidence', { recursive: true });
try {
  const adminChain = process.env.FORENA_M09_ADMIN_CHAIN === 'true';
  let teamId = process.env.FORENA_M09_TEAM;
  await page.goto(origin + (adminChain ? '/administration' : '/activities/manage'));
  await page.locator('input[name=email]').first().fill(process.env.FORENA_M09_EMAIL);
  await page.getByLabel('Lösenord', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Logga in', exact: true }).click();
  if (adminChain) {
    page.once('dialog', confirmation => confirmation.accept());
    await page.getByRole('button', { name: 'Aktivera systemadministration', exact: true }).click();
    await expect(page.getByText('Skapa klubb', { exact: true })).toBeVisible();
    await page.getByText('Skapa klubb', { exact: true }).click();
    const onboarding = page.locator('form.club-onboarding');
    await onboarding.getByLabel('Klubbens namn', { exact: true }).fill('Browserklubben');
    await onboarding.getByRole('button', { name: 'Nästa', exact: true }).click();
    await onboarding.locator('select[name=disciplineId]').selectOption('football');
    await onboarding.getByRole('button', { name: 'Nästa', exact: true }).click();
    assert.equal(clubCreates, 0, 'review must not create a club');
    await onboarding.getByRole('button', { name: 'Skapa klubb', exact: true }).click();
    const club = page.getByRole('region', { name: 'Klubb Browserklubben', exact: true });
    await expect(club).toBeVisible();
    await club.getByLabel('Klubbadministratör: e-post', { exact: true }).fill(process.env.FORENA_M09_EMAIL);
    page.once('dialog', confirmation => confirmation.accept());
    await Promise.all([
      page.waitForResponse(response => /\/api\/admin\/clubs\/[^/]+\/administrators$/.test(response.url()) && response.request().method() === 'POST'),
      club.getByRole('button', { name: 'Tilldela klubbadministratör', exact: true }).click(),
    ]);
    const section = club.getByRole('region', { name: 'Sektion Fotboll', exact: true });
    const teamForm = section.locator('form').filter({ has: page.getByRole('button', { name: 'Lägg till lag', exact: true }) });
    await teamForm.locator('input[name=name]').fill('Browserlaget');
    const [created] = await Promise.all([
      page.waitForResponse(response => /\/api\/admin\/sections\/[^/]+\/teams$/.test(response.url()) && response.request().method() === 'POST'),
      teamForm.getByRole('button', { name: 'Lägg till lag', exact: true }).click(),
    ]);
    assert.equal(created.status(), 200);
    console.log('STEP team created');
    teamId = lastCreatedTeamId;
    assert.equal(typeof teamId, 'string');
    await section.getByText('Lagadministratörer för Browserlaget', { exact: true }).click();
    console.log('STEP opened administrators');
    await section.getByLabel('Lagadministratör: e-post', { exact: true }).fill(process.env.FORENA_M09_TEAM_ADMIN_EMAIL);
    await section.getByLabel('Visningsnamn', { exact: true }).fill('Browserledaren');
    console.log('STEP administrator form filled');
    page.once('dialog', confirmation => confirmation.accept());
    const [granted] = await Promise.all([
      page.waitForResponse(response => /\/api\/admin\/teams\/[^/]+\/administrators$/.test(response.url()) && response.request().method() === 'POST'),
      section.getByRole('button', { name: 'Tilldela lagadministratör', exact: true }).click(),
    ]);
    assert.equal(granted.status(), 200);
    console.log('STEP assigned administrator');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `administration overflow at ${width}`);
    }
    await page.screenshot({ path: 'frontend/.evidence/m09-administration-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Öppna meny', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Logga ut från Förena', exact: true }).click();
    await page.locator('input[name=email]').first().fill(process.env.FORENA_M09_TEAM_ADMIN_EMAIL);
    await page.getByLabel('Lösenord', { exact: true }).fill('synthetic-password');
    await page.getByRole('button', { name: 'Logga in', exact: true }).click();
    await page.getByRole('link', { name: 'Hantera aktiviteter', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Hantera aktiviteter' })).toBeVisible();
  await page.getByRole('combobox').selectOption(teamId);
  await page.getByRole('button', { name: 'Ny aktivitet', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Övrigt', exact: true })).toBeVisible();
  await dialog.getByLabel('Titel', { exact: true }).fill('Browserträning');
  await dialog.getByLabel('Plats', { exact: true }).fill('Stora planen');
  // Late-evening defaults may cross midnight. Choose the intended single-day interval explicitly.
  await dialog.getByRole('button', { name: 'Samma dag', exact: true }).click();
  // The shared picker exposes exact native fields as a keyboard alternative.
  await dialog.getByText('Välj annat datum', { exact: true }).first().click();
  await dialog.locator('input[name="startsOn"]').fill('2030-10-25');
  await dialog.getByRole('button', { name: /^Starttid, välj klockslag/ }).click();
  await dialog.locator('input[type=time][aria-label=Starttid]').fill('18:00');
  await dialog.getByRole('button', { name: '1,5 tim', exact: true }).click();
  await dialog.getByLabel('Titel', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Förhandsgranska', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Skapa aktivitet', exact: true })).toBeVisible();
  await page.screenshot({ path: 'frontend/.evidence/m09-create-mobile.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Skapa aktivitet', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Redigera Browserträning', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('combobox').selectOption(teamId);
  await page.getByRole('button', { name: 'Redigera Browserträning', exact: true }).click();
  await expect(dialog.getByLabel('Plats', { exact: true })).toHaveValue('Stora planen');
  await dialog.getByLabel('Titel', { exact: true }).fill('Uppdaterad browserträning');
  await dialog.getByRole('button', { name: 'Förhandsgranska', exact: true }).click();
  await dialog.getByRole('button', { name: 'Spara ändring', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Redigera Uppdaterad browserträning', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Redigera Uppdaterad browserträning', exact: true }).click();
  page.once('dialog', confirmation => confirmation.accept());
  await dialog.getByRole('button', { name: 'Ställ in', exact: true }).click();
  await expect(page.getByText('Aktiviteten ställdes in.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Redigera Uppdaterad browserträning', exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole('combobox').selectOption(teamId);
  await expect(page.getByText('Uppdaterad browserträning', { exact: true })).toBeVisible();
  await expect(page.getByText('· Inställd', { exact: true })).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `horizontal overflow at ${width}`);
  }
  await page.screenshot({ path: 'frontend/.evidence/m09-cancelled-desktop.png', fullPage: true });
  assert.equal(writes, 3, 'exactly one create, update and cancellation');
  assert.deepEqual(errors, []);
  if (adminChain) assert.equal(clubCreates, 1, 'one club creation per user confirmation');
  if (adminChain) console.log('PASS first system admin → club + section → club admin → team → separate team-admin account → activity.');
  console.log('PASS Chromium → Spring → PostgreSQL: create, reload, edit, cancel, reload; mobile and desktop.');
} catch (cause) {
  console.log('Browser state:', await page.locator('main').innerText({ timeout: 2000 }).catch(() => 'unavailable'));
  console.log('Browser errors:', errors);
  await page.screenshot({ path: 'frontend/.evidence/m09-failure.png', fullPage: true, timeout: 3000 });
  throw cause;
} finally {
  await browser.close();
}
