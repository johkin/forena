import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';

const origin = 'https://app.example.invalid';
const backend = process.env.FORENA_EVALUATION_API;
const frontend = process.env.FORENA_EVALUATION_FRONTEND;
for (const endpoint of [backend, frontend]) assert.ok(['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname));
const team = process.env.FORENA_EVALUATION_TEAM;
const activity = process.env.FORENA_EVALUATION_ACTIVITY;
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium',
  env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('FORENA_'))),
});
let page;
try {
  const context = await browser.newContext();
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    const headers = { ...await request.allHeaders() };
    delete headers.host; delete headers['content-length'];
    const response = await fetch(new URL(url.pathname + url.search, url.pathname.startsWith('/api/') ? backend : frontend), {
      method: request.method(), headers, redirect: 'manual', body: ['GET', 'HEAD'].includes(request.method()) ? undefined : request.postDataBuffer(),
    });
    const output = Object.fromEntries(response.headers.entries());
    for (const name of ['content-length', 'content-encoding', 'transfer-encoding']) delete output[name];
    if (response.headers.getSetCookie().length) output['set-cookie'] = response.headers.getSetCookie().join('\n');
    await route.fulfill({ status: response.status, headers: output, body: Buffer.from(await response.arrayBuffer()) });
  });
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.url().includes('/api/') && response.status() >= 400) console.log(response.status(), new URL(response.url()).pathname);
  });
  await page.goto(`${origin}/teams/${team}/evaluation`);
  const login = page.locator('form.auth-form').filter({ has: page.locator('input[name=password]') });
  await login.locator('input[name=email]').fill(process.env.FORENA_EVALUATION_EMAIL);
  await login.getByLabel('Lösenord', { exact: true }).fill('synthetic-password');
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/auth/login') && response.ok()),
    login.getByRole('button', { name: 'Logga in', exact: true }).click(),
  ]);
  await expect(page.getByRole('heading', { name: 'Spelarutvärdering', exact: true })).toBeVisible();
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/teams/${team}/evaluation`);
    await page.getByRole('button', { name: 'Aktivera spelarutvärdering' }).click();
    await page.getByText('Mätpunkter och regler', { exact: true }).click();
    await page.getByRole('button', { name: 'Lägg till mätpunkt' }).click();
    await page.getByLabel('Namn på mätpunkt 1', { exact: true }).fill('Teknik');
    await page.getByRole('button', { name: 'Lägg till mätpunkt' }).click();
    await page.getByLabel('Namn på mätpunkt 2', { exact: true }).fill('Driv');
    await page.getByRole('combobox', { name: /Typ för mätpunkt 2/ }).selectOption('development');
    await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/player-evaluation') && response.request().method() === 'PUT' && response.ok()),
      page.getByRole('button', { name: 'Spara mätpunkter och regler' }).click(),
    ]);
    for (const [index, value] of [9, 5, 3].entries()) {
      await page.getByText(`Person ${index}`, { exact: true }).click();
      await page.getByRole('spinbutton', { name: `Person ${index}: Teknik`, exact: true }).fill(String(value));
      await page.getByRole('spinbutton', { name: `Person ${index}: Driv`, exact: true }).fill('7');
    }
    await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/player-evaluation/scores') && response.ok()),
      page.getByRole('button', { name: 'Spara betyg', exact: true }).click(),
    ]);
    await expect(page.getByRole('status').filter({ hasText: 'Ändringen har sparats.' })).toBeVisible();
    await page.getByRole('button', { name: 'Spelarutvärdering – dagens fördelning', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Förmågegrupp 2', exact: true })).toBeVisible();
    await expect(page.getByText('Kan prova nästa förmågegrupp – ledaren beslutar', { exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: '9', exact: true }).first()).toBeVisible();
    await page.goto(`${origin}/activities/${activity}`);
    await page.getByRole('button', { name: 'Gruppförslag', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Saknar bedömning – ledaren beslutar på plats' })).toBeVisible();
    const calls = [];
    page.on('request', request => { if (request.url().includes('/read-views')) calls.push(request.url()); });
    await page.getByRole('combobox', { name: /Indelningssätt/ }).selectOption('balanced');
    await expect(page.getByRole('heading', { name: 'Lag 1', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: /Indelningssätt/ })).toHaveValue('balanced');
    await expect(page.getByText('Kan prova nästa förmågegrupp – ledaren beslutar', { exact: true })).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Person 3', exact: true }).uncheck();
    await expect(page.getByRole('heading', { name: 'Saknar bedömning – ledaren beslutar på plats' })).toHaveCount(0);
    const before = calls.length;
    await page.waitForTimeout(300);
    assert.equal(calls.length, before, 'no automatic polling or moving groups');
    await page.getByRole('button', { name: 'Uppdatera', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Förmågegrupp 1', exact: true })).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.goto(`${origin}/teams/${team}/evaluation`);
    await page.getByText('Mätpunkter och regler', { exact: true }).click();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Stäng av och radera utvärderingsdata' }).click();
    await expect(page.getByRole('button', { name: 'Aktivera spelarutvärdering' })).toBeVisible();
    console.log(`PASS ${width}px: activation → metrics → scores → report → training proposal → filters → disable, actual Kotlin API and PostgreSQL`);
  }
  assert.deepEqual(errors, []);
} catch (cause) {
  if (page) console.log(await page.locator('main').innerText());
  throw cause;
} finally { await browser.close(); }
