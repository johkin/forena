import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const origins = [process.env.FORENA_PARITY_NEXT ?? 'http://127.0.0.1:3004', process.env.FORENA_PARITY_VITE ?? 'http://127.0.0.1:3005'];
for (const origin of origins) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
const browser = await chromium.launch({ headless: true, executablePath: process.env.FORENA_BROWSER_EXECUTABLE ?? '/usr/bin/chromium' });
await mkdir('frontend/.evidence/roster', { recursive: true });
try {
  for (const width of [320, 375, 390, 768, 1280]) {
    const renderings = new Map();
    for (const [app, origin] of origins.entries()) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/components`);
      const example = page.locator('#team-roster-example');
      await expect(example).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      for (const mode of ['members', 'profile', 'edit', 'groups', 'group', 'empty', 'loading', 'error', 'pending', 'denied']) {
        await example.getByLabel('Truppläge', { exact: true }).selectOption(mode);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${mode} overflows at ${width}px`);
        if (['loading', 'denied'].includes(mode)) continue;
        const card = example.locator('.members-admin-card');
        await card.screenshot({ path: `frontend/.evidence/roster/${app}-${mode}-${width}.png`, animations: 'disabled' });
        const layout = await card.evaluate(root => {
          const origin = root.getBoundingClientRect();
          return [root, ...root.querySelectorAll('*')].map(element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return { tag: element.tagName, x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height,
              display: style.display, padding: style.padding, margin: style.margin, gap: style.gap, border: style.border,
              borderRadius: style.borderRadius, font: style.font, color: style.color, background: style.backgroundColor };
          });
        });
        if (app === 0) renderings.set(mode, layout);
        else assert.deepEqual(layout, renderings.get(mode), `roster layout/styles ${mode} at ${width}px`);
      }
      await example.getByLabel('Truppläge', { exact: true }).selectOption('members');
      const headings = await example.locator('.squad-section h2').allTextContents();
      assert.match(headings[0], /Ledare/); assert.match(headings[1], /Spelare/); assert.match(headings[2], /Volontärer/);
      await example.getByLabel('Sök i truppen').fill('Alex');
      await expect(example.locator('.squad-person')).toHaveCount(1);
      await example.locator('.squad-person').click();
      await expect(example.getByRole('heading', { name: 'Målsmän', exact: true })).toBeVisible();
      await expect(example.getByRole('link', { name: '+46 70 123 45 67' })).toHaveAttribute('href', 'tel:+46701234567');
      await example.getByLabel('Truppläge', { exact: true }).selectOption('edit');
      await example.getByRole('textbox', { name: 'Namn', exact: true }).fill('Robin Ändrat namn');
      await example.getByRole('button', { name: 'Spara medlem' }).click();
      await expect(example.getByRole('heading', { name: 'Robin Ändrat namn' })).toBeVisible();
      await expect(example.getByText('Tränare · Lagledare', { exact: true })).toBeVisible();
      await expect(example.getByRole('heading', { name: 'Barn i laget' })).toBeVisible();
      await example.getByLabel('Truppläge', { exact: true }).selectOption('group');
      const available = example.locator('.squad-picker-list').first();
      await expect(available.getByRole('button')).toHaveCount(2); // The dual-role leader occurs once.
      await available.getByRole('button', { name: /Lägg till Robin/ }).click();
      await example.getByLabel('Sök medlemmar').fill('Kim');
      await example.getByLabel('Sök medlemmar').fill('');
      if (width <= 600) await example.getByRole('button', { name: 'I gruppen (2)', exact: true }).click();
      await expect(example.locator('.squad-picker-list').last().getByRole('button')).toHaveCount(2);
      await example.getByLabel('Gruppnamn', { exact: true }).fill('Lag Blå');
      await example.getByRole('button', { name: 'Spara grupp', exact: true }).click();
      await expect(example.getByRole('heading', { name: 'Lag Blå', exact: true })).toBeVisible();
      await example.getByRole('button', { name: 'Ta bort grupp', exact: true }).click();
      await expect(example.getByText('Ta bort Lag Blå? Medlemmarna finns kvar i laget.')).toBeVisible();
      await example.getByRole('button', { name: 'Avbryt', exact: true }).click();
      await expect(example.getByRole('button', { name: 'Ja, ta bort gruppen' })).toHaveCount(0);
      await example.getByRole('button', { name: 'Ta bort grupp', exact: true }).click();
      await example.getByRole('button', { name: 'Ja, ta bort gruppen' }).click();
      await example.getByRole('link', { name: 'Medlemmar', exact: true }).click();
      await expect(example.locator('.squad-count')).toContainText('3 av 3 medlemmar');
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(`PASS ${width}px: Next/Vite exact roster layout/styles, role order, profile, name, selection, deletion, overflow`);
  }

  // Real browser transport with explicit mocked API: verify payloads and failed-write draft retention.
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const team = '11111111-1111-4111-8111-111111111111';
  const person = '22222222-2222-4222-8222-222222222222';
  const group = '33333333-3333-4333-8333-333333333333';
  const account = '44444444-4444-4444-8444-444444444444';
  const base = `/api/teams/${team}/roster`;
  let writes = 0;
  const snapshot = { team: { id: team, name: 'Testlaget', organizationName: 'Testklubben' },
    people: [{ id: person, name: 'Alex Test', roles: ['leader', 'participant'], title: 'Tränare', linked: true, guardians: [], childIds: [] }],
    groups: [{ id: group, name: 'Lag Gul', revision: 3, personIds: [] }] };
  await page.route('**/api/**', async route => {
    const req = route.request(); const url = new URL(req.url());
    if (url.pathname === '/api/auth/session') return route.fulfill({ json: { user: { id: account, email: 'test@example.invalid' } } });
    if (url.pathname === '/api/admin/overview') return route.fulfill({ json: { platformAdmin: false, canBootstrap: false, platformAdministrators: [], clubs: [] } });
    if (url.pathname === '/api/me/overview') return route.fulfill({ json: {
      reference_time: new Date().toISOString(), activities: [], organizations: [], teams: [], calendar_people: [], calendar_teams: [],
    } });
    if (url.pathname === `${base}/access`) return route.fulfill({ json: true });
    if (url.pathname === base && req.method() === 'GET') return route.fulfill({ json: snapshot });
    if (url.pathname === `${base}/groups/${group}` && req.method() === 'PUT') {
      writes++;
      assert.equal(req.headers()['x-forena-account'], account);
      assert.equal(req.headers()['x-forena-request'], '1');
      assert.match(req.headers()['content-type'], /application\/json/);
      assert.deepEqual(req.postDataJSON(), { name: 'Mitt utkast', personIds: [person], revision: 3 });
      return route.fulfill({ status: 409, json: { error: 'Gruppen har ändrats. Ditt utkast finns kvar.' } });
    }
    throw new Error(`Unexpected API request ${req.method()} ${url.pathname}`);
  });
  await page.goto(`${origins[1]}/teams/${team}/members?view=groups&group=${group}`);
  await page.getByLabel('Gruppnamn', { exact: true }).fill('Mitt utkast');
  await page.getByRole('button', { name: /Lägg till Alex Test/ }).click();
  await page.getByRole('button', { name: 'Spara grupp', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Ditt utkast finns kvar');
  await expect(page.getByLabel('Gruppnamn', { exact: true })).toHaveValue('Mitt utkast');
  await expect(page.getByRole('button', { name: 'I gruppen (1)', exact: true })).toBeVisible();
  assert.equal(writes, 1);
  await page.close();
  console.log('PASS mocked API transport: exact roster path, JSON payload, account binding, revision, retained failed draft');
} finally { await browser.close(); }
