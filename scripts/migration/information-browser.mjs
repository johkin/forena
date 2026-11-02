import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const origin = 'https://app.example.invalid';
const backend = process.env.FORENA_M09_API;
const frontend = process.env.FORENA_M09_FRONTEND ?? 'http://localhost:3000';
for (const endpoint of [backend, frontend]) assert.ok(['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname));
const browser = await chromium.launch({ headless: true,
  ...(process.env.FORENA_BROWSER_EXECUTABLE ? { executablePath: process.env.FORENA_BROWSER_EXECUTABLE } : {}),
  env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('FORENA_'))),
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.route('**/*', async route => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin !== origin) return route.abort();
  const headers = { ...await request.allHeaders() };
  delete headers.host;
  delete headers['content-length'];
  const api = url.pathname.startsWith('/api/');
  const response = await fetch(new URL(url.pathname + url.search, api ? backend : frontend), {
    method: request.method(), headers, redirect: 'manual',
    body: ['GET', 'HEAD'].includes(request.method()) ? undefined : request.postDataBuffer(),
  });
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

async function login(email) {
  // Logout can still be replacing an administration form with an email input.
  // Wait for the guest view before choosing the login form's fields.
  await expect(page.getByRole('heading', { name: 'Logga in', exact: true })).toBeVisible();
  const form = page.locator('form.auth-form').filter({ has: page.locator('input[name=password]') });
  await form.locator('input[name=email]').fill(email);
  await form.getByLabel('Lösenord', { exact: true }).fill('synthetic-password');
  const [loggedIn] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/login' && response.request().method() === 'POST'),
    form.getByRole('button', { name: 'Logga in', exact: true }).click(),
  ]);
  assert.equal(loggedIn.status(), 200);
  // A click can finish before the login request. Wait for the authenticated
  // shell so the session cookie is saved before the next document navigation.
  await expect(page.getByRole('link', { name: 'Visa kallelser som behöver svar' })).toBeVisible();
}

try {
  const activityId=process.env.FORENA_INFORMATION_ACTIVITY;
  assert.ok(activityId);
  await page.goto(`${origin}/activities/${activityId}`);
  await login(process.env.FORENA_M09_EMAIL);
  for(const width of [390,1280]) {
    await page.setViewportSize({width,height:900});
    await page.goto(`${origin}/activities/${activityId}`);
    const form=page.getByRole('region',{name:'Matchuppföljning',exact:true});
    await expect(form).toBeVisible();
    await form.getByLabel('Faktisk lagkapten',{exact:true}).selectOption(process.env.FORENA_INFORMATION_PLAYER);
    await form.getByLabel('Delades Gröna kortet ut?',{exact:true}).selectOption('awarded');
    await form.getByRole('checkbox',{name:'Person 1',exact:true}).check();
    await form.getByRole('button',{name:'Spara matchuppföljning',exact:true}).click();
    await expect(form.getByRole('status')).toContainText('Matchuppföljningen har sparats.');
    await page.reload();
    await expect(form.getByLabel('Faktisk lagkapten',{exact:true})).toHaveValue(process.env.FORENA_INFORMATION_PLAYER);
    await expect(form.getByRole('checkbox',{name:'Person 1',exact:true})).toBeChecked();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
    await form.screenshot({path:`frontend/.evidence/information-real-${width}.png`});
  }
  assert.deepEqual(errors,[]);
  console.log('Real Spring/PostgreSQL matchuppföljning: mobile, desktop, shared save, reload and history OK');
} finally {
  await context.close();
  await browser.close();
}
