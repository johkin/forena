import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';

// Invoked by the opt-in ApiTest against its real Spring/Postgres fixture.
// A local transport bridge preserves the canonical HTTPS origin and secure
// cookie semantics. Only the provider is mocked by ApiTest; API/data are real.
const api = new URL(process.env.FORENA_BROWSER_API_BASE);
assert.equal(api.hostname, '127.0.0.1');
const origin = 'https://app.example.invalid';
const activity = process.env.FORENA_BROWSER_ACTIVITY_ID;
assert.match(activity, /^[0-9a-f-]{36}$/);
const browser = await chromium.launch({ headless: true,
  ...(process.env.FORENA_BROWSER_EXECUTABLE ? { executablePath: process.env.FORENA_BROWSER_EXECUTABLE } : {}),
  env: Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('FORENA_'))),
});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const privateReplies = [];
  await context.route(origin + '/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/config.json') return route.fulfill({ json: {
      supabaseUrl: 'https://ckzrtxqjskosqzoitymc.supabase.co', publishableKey: 'sb_publishable_synthetic',
      activityId: activity, version: activity,
    } });
    const backend = path.startsWith('/api/');
    if (backend) assert.equal(route.request().headers().authorization, undefined);
    const response = await route.fetch({ url: new URL(path, backend ? api : 'http://127.0.0.1:3000').href, maxRedirects: 0 });
    if (backend) privateReplies.push(response.status());
    return route.fulfill({ response });
  });
  const page = await context.newPage();
  await page.goto(origin + '/activities/' + activity);
  await expect(page.getByRole('heading', { name: 'Logga in', exact: true })).toBeVisible();
  await page.evaluate(() => { window.documentInstance = 'no-reload'; });
  await page.getByLabel('E-postadress', { exact: true }).fill('family@example.invalid');
  await page.getByLabel('Lösenord', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Logga in', exact: true }).click();
  const rows = page.locator('.personal-invitation-response');
  await expect(rows).toHaveCount(3);
  assert.equal(await page.evaluate(() => window.documentInstance), 'no-reload');
  const cookie = (await context.cookies(origin)).find(item => item.name === '__Host-forena-session');
  assert.ok(cookie?.httpOnly && cookie.secure && cookie.sameSite === 'Lax');
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  assert.equal(await page.evaluate(() => document.cookie.includes('forena-session')), false);
  await rows.filter({ hasText: 'Person 1' }).getByRole('button', { name: 'Kommer', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'har sparats' })).toBeVisible();
  await page.reload();
  await expect(rows).toHaveCount(3);
  const csrf = await page.evaluate(async () => (await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })).status);
  assert.equal(csrf, 403);
  await page.getByRole('button', { name: 'Öppna meny', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Logga ut från Förena' }).click();
  await expect(page.getByRole('heading', { name: 'Logga in', exact: true })).toBeVisible();
  await expect(rows).toHaveCount(0);
  assert.equal((await context.cookies(origin)).filter(item => item.name === '__Host-forena-session').length, 0);
  assert.ok(privateReplies.includes(200) && privateReplies.includes(401) && privateReplies.includes(403));
  console.log('PASS: browser -> actual Kotlin -> actual PostgreSQL -> browser; password, Secure/HttpOnly cookie, private read/write/reload, CSRF rejection and logout');
} finally { await browser.close(); }
