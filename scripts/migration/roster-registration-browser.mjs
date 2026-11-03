import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const app = 'https://app.example.invalid';
const backend = process.env.FORENA_ROSTER_API;
const mailbox = process.env.FORENA_ROSTER_MAILBOX;
const frontend = process.env.FORENA_ROSTER_FRONTEND ?? 'http://localhost:3005';
for (const endpoint of [backend, mailbox, frontend]) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname));
const browser = await chromium.launch({ headless: true, executablePath: process.env.FORENA_BROWSER_EXECUTABLE || '/usr/bin/chromium' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const errors = [];
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  assert.equal(url.origin, app, 'The test must stay on the synthetic app origin');
  const headers = { ...await request.allHeaders() };
  delete headers.host; delete headers['content-length'];
  const api = url.pathname.startsWith('/api/');
  const response = await fetch(new URL(url.pathname + url.search, api ? backend : frontend), {
    method: request.method(), headers, redirect: 'manual',
    body: ['GET', 'HEAD'].includes(request.method()) ? undefined : request.postDataBuffer(),
  });
  const output = Object.fromEntries(response.headers.entries());
  for (const name of ['content-encoding', 'content-length', 'transfer-encoding']) delete output[name];
  if (response.headers.getSetCookie().length) output['set-cookie'] = response.headers.getSetCookie().join('\n');
  await route.fulfill({ status: response.status, headers: output, body: Buffer.from(await response.arrayBuffer()) });
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
await mkdir('frontend/.evidence/roster-registration', { recursive: true });
const adminEmail = process.env.FORENA_ROSTER_ADMIN_EMAIL;
const email = process.env.FORENA_ROSTER_EMAIL;
const team = process.env.FORENA_ROSTER_TEAM;
async function login(address, password) {
  await page.getByLabel('E-postadress', { exact: true }).fill(address);
  await page.getByLabel('Lösenord', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Logga in', exact: true }).click();
}
async function code(kind) {
  const response = await fetch(`${mailbox}/${kind}`);
  assert.equal(response.status, 200);
  return (await response.json()).code;
}
async function screenshot(name) {
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} overflow at ${width}px`);
    await page.screenshot({ path: `frontend/.evidence/roster-registration/${name}-${width}.png`, fullPage: true });
  }
}
try {
  await page.goto(`${app}/teams/${team}/members`);
  await login(adminEmail, 'synthetic-password');
  await expect(page.getByRole('heading', { name: 'Truppen', exact: true })).toBeVisible();
  for (const role of ['leader', 'participant']) {
    await page.getByText('+ Lägg till medlem', { exact: true }).click();
    await page.getByLabel('Namn eller sök befintlig person').fill(role === 'leader' ? 'Ny browserledare' : 'Ny browserspelare');
    await page.getByRole('button', { name: 'Sök i föreningen', exact: true }).click();
    await expect(page.getByText('Inga personer matchar sökningen.', { exact: true })).toBeVisible();
    await page.getByLabel('Roll', { exact: true }).selectOption(role);
    if (role === 'participant') await page.getByLabel('Egen e-postadress (valfritt)').fill(email);
    await screenshot(`create-${role}`);
    await page.getByRole('button', { name: 'Lägg till medlem', exact: true }).click();
    await expect(page.getByText('Medlemmen har lagts till.', { exact: false })).toBeVisible();
    await expect(page.getByText(role === 'leader' ? 'Ny browserledare' : 'Ny browserspelare', { exact: true })).toBeVisible();
  }
  const invitation = await code('invite');
  await page.getByText('Ny browserspelare', { exact: true }).click();
  await page.reload();
  await expect(page.getByText('E-postleverantören har accepterat utskicket.', { exact: false })).toBeVisible();
  await screenshot('invited-profile');
  // A new browser, with no admin session, follows the real delivered link.
  const recipient = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await recipient.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    assert.equal(url.origin, app);
    const headers = { ...await request.allHeaders() };
    delete headers.host; delete headers['content-length'];
    const response = await fetch(new URL(url.pathname + url.search, url.pathname.startsWith('/api/') ? backend : frontend), {
      method: request.method(), headers, redirect: 'manual', body: ['GET', 'HEAD'].includes(request.method()) ? undefined : request.postDataBuffer(),
    });
    const output = Object.fromEntries(response.headers.entries());
    for (const name of ['content-encoding', 'content-length', 'transfer-encoding']) delete output[name];
    if (response.headers.getSetCookie().length) output['set-cookie'] = response.headers.getSetCookie().join('\n');
    await route.fulfill({ status: response.status, headers: output, body: Buffer.from(await response.arrayBuffer()) });
  });
  const guest = await recipient.newPage();
  guest.on('pageerror', error => errors.push(error.message));
  await guest.goto(`${app}/join-team?code=${invitation}`);
  await guest.getByRole('button', { name: 'Fortsätt med inbjudan' }).click();
  await guest.getByRole('link', { name: 'Skapa konto' }).click();
  await guest.getByLabel('E-postadress', { exact: true }).fill(email);
  await guest.getByLabel('Nytt lösenord', { exact: true }).fill('synthetic-browser-password');
  await guest.getByRole('button', { name: 'Skapa konto', exact: true }).click();
  await expect(guest.getByText('Om adressen kan registreras', { exact: false })).toBeVisible();
  const verification = await code('verify');
  await guest.goto(`${app}/auth/verify?code=${verification}`);
  await guest.getByRole('button', { name: 'Verifiera e-postadress' }).click();
  await expect(guest.getByText('E-postadressen är verifierad.', { exact: false })).toBeVisible();
  await guest.getByRole('link', { name: 'Till inloggningen' }).click();
  await guest.getByLabel('E-postadress', { exact: true }).fill(email);
  await guest.getByLabel('Lösenord', { exact: true }).fill('synthetic-browser-password');
  await guest.getByRole('button', { name: 'Logga in', exact: true }).click();
  await expect(guest.getByText(`Koppla kontot ${email} till Ny browserspelare i Lag.`, { exact: true })).toBeVisible();
  await guest.getByRole('button', { name: 'Acceptera inbjudan', exact: true }).click();
  await expect(guest).toHaveURL(`${app}/teams/${team}`);
  await expect(guest.getByRole('heading', { name: 'Acceptera laginbjudan' })).toHaveCount(0);
  await expect(guest.getByRole('link', { name: 'Truppen', exact: true })).toHaveCount(0);
  await guest.screenshot({ path: 'frontend/.evidence/roster-registration/activated-account.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS real browser → Spring → PostgreSQL → mail outbox → registration → verification → login → explicit acceptance → team access, without roster administration');
} finally { await browser.close(); }
