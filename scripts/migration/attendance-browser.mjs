import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { assertSameRendering } from './ui-parity-images.mjs';

const origins = [process.env.FORENA_PARITY_NEXT ?? 'http://127.0.0.1:3004', process.env.FORENA_PARITY_VITE ?? 'http://localhost:3005'];
for (const origin of origins) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
const browser = await chromium.launch({ headless: true, ...(process.env.FORENA_BROWSER_EXECUTABLE ? { executablePath: process.env.FORENA_BROWSER_EXECUTABLE } : {}) });
await mkdir('frontend/.evidence/attendance', { recursive: true });
async function verifyFocusContainment(page, dialog) {
  const controls = dialog.locator('button:enabled:visible, input:enabled:visible, summary:visible, a[href]:visible');
  await dialog.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(controls.last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(controls.first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(controls.last()).toBeFocused();
  await dialog.focus();
  await page.keyboard.press('Tab');
  await expect(controls.first()).toBeFocused();
  // Disabled or removed controls can leave the active element on body during an async save.
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await expect(page.locator('body')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(controls.last()).toBeFocused();
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.keyboard.press('Tab');
  await expect(controls.first()).toBeFocused();
  await dialog.focus();
}

try {
  for (const width of [320, 375, 390, 768, 1280]) {
    const images = new Map();
    for (const [app, origin] of origins.entries()) {
      console.log(`Checking ${origin} at ${width}px`);
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.setDefaultTimeout(15_000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/components`);
      if (app === 0) await page.addStyleTag({ content: 'nextjs-portal { display:none !important; }' });
      await page.evaluate(() => document.fonts.ready);
      const example = page.locator('#attendance-example');
      for (const mode of ['Ny rapport', 'Sparad rapport', 'Inställd', 'Tom lista', 'Sparfel', 'Konflikt', 'Laddar', 'Läsfel']) {
        // Start every state from a fresh document, without cached focus or compositor layers from another case.
        await page.reload();
        await page.evaluate(() => document.fonts.ready);
        await example.getByLabel('Närvaroläge').selectOption(mode);
        // Keep the fixed body's origin identical; distant gallery scroll offsets change curve rasterization.
        await page.evaluate(() => window.scrollTo(0, 0));
        await example.getByRole('button', { name: 'Öppna närvaro' }).evaluate(button => {
          button.focus({ preventScroll: true });
          button.click();
        });
        const dialog = page.getByRole('dialog', { name: 'Rapportera närvaro' });
        if (mode !== 'Laddar') await expect(dialog.getByText('Laddar närvaron…', { exact: true })).toHaveCount(0);
        else await expect(dialog.getByText('Laddar närvaron…', { exact: true })).toBeVisible();
        if (mode === 'Sparad rapport' || mode === 'Inställd') await dialog.getByText(/Ändringshistorik/).click();
        if (mode === 'Sparfel' || mode === 'Konflikt') {
          if (mode === 'Sparfel') await dialog.getByRole('checkbox').first().check();
          await dialog.getByRole('button', { name: 'Spara närvaro', exact: true }).click();
          await expect(dialog.getByRole('alert').first()).toBeVisible();
          await expect(mode === 'Konflikt' ? dialog.getByRole('checkbox', { name: /Alex Andersson/ }) : dialog.getByRole('checkbox').first()).toBeChecked();
          if (mode === 'Konflikt') {
            await dialog.getByRole('button', { name: 'Läs in senaste rapporten för avstämning' }).click();
            await expect(dialog.getByRole('region', { name: 'Stäm av senaste rapporten' })).toBeVisible();
            await dialog.getByRole('button', { name: 'Använd senaste versionen och behåll mina val' }).click();
            await expect(mode === 'Konflikt' ? dialog.getByRole('checkbox', { name: /Alex Andersson/ }) : dialog.getByRole('checkbox').first()).toBeChecked();
          }
        }
        if (mode === 'Inställd') {
          await expect(dialog.getByRole('button', { name: 'Spara närvaro', exact: true })).toHaveCount(0);
          for (const checkbox of await dialog.getByRole('checkbox').all()) await expect(checkbox).toBeDisabled();
        }
        if (mode === 'Ny rapport') {
          await dialog.getByRole('button', { name: 'Spara närvaro', exact: true }).click();
          await expect(dialog.getByText('Du rapporterar 0 närvarande. Alla i listan registreras som frånvarande.', { exact: true })).toBeVisible();
          await dialog.getByRole('button', { name: 'Avbryt bekräftelse' }).click();
          await dialog.getByRole('searchbox', { name: 'Sök medlem', exact: true }).fill('Ella');
          await dialog.getByRole('button', { name: 'Lägg till Ella Holm', exact: true }).click();
          await expect(dialog.getByRole('checkbox')).toHaveCount(4);
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${mode} overflows at ${width}px`);
        await page.mouse.move(0, 0);
        await dialog.evaluate(element => { element.scrollTop = 0; });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        // Hide unrelated gallery content behind the translucent backdrop; preserve the dialog's production CSS.
        const image = await dialog.screenshot({ path: `frontend/.evidence/attendance/${app}-${mode}-${width}.png`, animations: 'disabled',
          style: 'body * { visibility: hidden; } .modal-backdrop, .modal-backdrop * { visibility: visible; }' });
        if (app === 0) images.set(mode, image);
        else assertSameRendering(images.get(mode), image, `${mode} ${width}px`);
        // Screenshot-only visibility isolation can blur controls; restore the dialog before testing Escape.
        await dialog.focus();
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(example.getByRole('button', { name: 'Öppna närvaro' })).toBeFocused();
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(`PASS ${width}px: Next/React attendance parity, history, cancellation, additions, zero confirmation, conflicts, errors, keyboard and overflow`);
  }

  // Exercise keyboard recovery separately from pixel comparisons so interaction state cannot affect snapshots.
  for (const origin of origins) {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`${origin}/components`);
      const example = page.locator('#attendance-example');
      await example.getByLabel('Närvaroläge').selectOption('Sparfel');
      await example.getByRole('button', { name: 'Öppna närvaro' }).click();
      const dialog = page.getByRole('dialog', { name: 'Rapportera närvaro' });
      await dialog.getByRole('checkbox').first().check();
      await dialog.getByRole('button', { name: 'Spara närvaro', exact: true }).click();
      await expect(dialog.getByRole('alert')).toBeVisible();
      await verifyFocusContainment(page, dialog);
      await page.keyboard.press('Escape');
      await expect(example.getByRole('button', { name: 'Öppna närvaro' })).toBeFocused();
      await page.close();
    }
  }
  console.log('PASS keyboard regression: Tab and Shift+Tab wrap from dialog container, body and controls after save errors on mobile/desktop in both apps');

  // Production React entry and account-bound transport, with explicit synthetic HTTP responses.
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const id = '11111111-1111-4111-8111-111111111111';
  const account = '22222222-2222-4222-8222-222222222222';
  const person = '33333333-3333-4333-8333-333333333333';
  const second = '44444444-4444-4444-8444-444444444444';
  const base = `/api/activities/${id}/attendance`;
  let revision = 0, writes = 0;
  const roster = [
    { personId: person, displayName: 'Alex Test', role: 'leader', response: 'accepted', present: null },
    { personId: second, displayName: 'Alva Test', role: 'participant', response: 'declined', present: null },
  ];
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path === '/api/auth/session') return route.fulfill({ json: { user: { id: account, email: 'test@example.invalid' } } });
    if (path === '/api/admin/overview') return route.fulfill({ json: { platformAdmin: false, canBootstrap: false, platformAdministrators: [], clubs: [] } });
    if (path === '/api/me/managed-teams') return route.fulfill({ json: [] });
    if (path === '/api/me/overview') return route.fulfill({ json: {
      reference_time: new Date().toISOString(), activities: [], organizations: [], teams: [], calendar_people: [], calendar_teams: [],
    } });
    if (path === `/api/activities/${id}`) return route.fulfill({ json: {
      id, can_manage_activities: false, can_manage_attendance: true, title: 'Historisk träning', starts_at: '2020-01-01T10:00:00Z', ends_at: '2020-01-01T12:00:00Z',
      gathering_at: null, response_due_at: null, location: '', description: '', status: 'scheduled',
      organization: { id, name: 'Klubb', time_zone: 'Europe/Stockholm', role: null },
      team: { id, organization_id: id, name: 'Lag', roles: ['leader'] }, people: [],
    } });
    if (path === `${base}/access`) return route.fulfill({ json: true });
    if (path === base && req.method() === 'GET') return route.fulfill({ json: { revision, reportedAt: null, status: 'scheduled', writable: true, roster, candidates: [], groups: [], history: [] } });
    if (path === base && req.method() === 'PUT') {
      writes++;
      assert.equal(req.headers()['x-forena-account'], account);
      assert.equal(req.headers()['x-forena-request'], '1');
      const body = req.postDataJSON();
      assert.deepEqual(body, { revision: writes === 1 ? 0 : 1, rosterIds: [person, second], personIds: [person], confirmEmpty: false });
      if (writes === 1) { revision = 1; return route.fulfill({ status: 409, json: { error: 'Rapporten har ändrats. Dina val finns kvar.' } }); }
      return route.fulfill({ status: 204 });
    }
    throw new Error(`Unexpected API request ${req.method()} ${path}`);
  });
  await page.goto(`${origins[1]}/activities/${id}`);
  await page.getByRole('button', { name: 'Justera närvaro', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Rapportera närvaro' });
  await dialog.getByRole('checkbox', { name: /Alex Test/ }).check();
  await dialog.getByRole('searchbox', { name: 'Sök deltagare', exact: true }).fill('Alva');
  await expect(dialog.getByRole('checkbox')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Spara närvaro', exact: true }).click();
  await expect(dialog.getByRole('alert').first()).toContainText('Dina val finns kvar');
  await verifyFocusContainment(page, dialog);
  await dialog.getByRole('button', { name: 'Läs in senaste rapporten för avstämning' }).click();
  await dialog.getByRole('button', { name: 'Använd senaste versionen och behåll mina val' }).click();
  await verifyFocusContainment(page, dialog);
  await dialog.getByRole('button', { name: 'Spara närvaro', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  assert.equal(writes, 2);
  console.log('PASS production React activity entry and mocked account-bound HTTP: full hidden selection, first-report conflict, reconciliation, retry');
  await page.close();
} finally { await browser.close(); }
