import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const origins = (process.env.FORENA_ATTENTION_ORIGINS ?? 'http://127.0.0.1:3004,http://127.0.0.1:3005').split(',');
const frontend = process.env.FORENA_BROWSER_BASE_URL ?? 'http://127.0.0.1:3005';
for (const origin of [...origins, frontend]) assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const browser = await chromium.launch({ headless: true, ...(process.env.FORENA_BROWSER_EXECUTABLE ? { executablePath: process.env.FORENA_BROWSER_EXECUTABLE } : {}) });
await mkdir('frontend/.evidence/team-attention', { recursive: true });
const team = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const familyTeam = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const organization = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const activity = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const person = '11111111-1111-4111-8111-111111111111';
const signal = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const before = (page, first, second) => page.evaluate(([a, b]) => Boolean(document.querySelector(a)?.compareDocumentPosition(document.querySelector(b)) & Node.DOCUMENT_POSITION_FOLLOWING), [first, second]);
try {
  for (const width of [390, 1280]) {
    for (const [index, origin] of origins.entries()) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`${origin}/components`);
      const example = page.locator('#discipline-administration-example');
      await expect(example.getByRole('heading', { name: /För laget ·/ })).toBeVisible();
      assert.ok(await before(page, '#discipline-administration-example .team-attention', '#discipline-administration-example .personal-calendar-section'));
      await expect(example.getByRole('heading', { name: 'Lagets spelaruppgifter', exact: true })).toHaveCount(0);
      const profile = example.locator('.members-admin-card');
      await expect(profile.getByRole('heading', { name: 'Alex Exempel', exact: true })).toBeVisible();
      await expect(profile.getByText('Tröjnummer', { exact: true })).toBeVisible();
      await expect(profile.getByText('7', { exact: true })).toBeVisible();
      await example.getByRole('button', { name: 'Påminn obesvarade', exact: true }).click();
      await example.getByRole('button', { name: 'Bekräfta', exact: true }).click();
      await expect(example.getByRole('status').filter({ hasText: 'Påminnelse köad för leverans.' })).toBeVisible();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await example.locator('.team-attention').screenshot({ path: `frontend/.evidence/team-attention/gallery-${index}-${width}.png` });
      await profile.screenshot({ path: `frontend/.evidence/team-attention/profile-${index}-${width}.png` });
      await page.close();
    }

    const page = await browser.newPage({ viewport: { width, height: 900 } });
    let queued = false;
    let number = 7;
    let fieldRevision = 1;
    let rosterAllowed = true;
    const requests = [];
    await page.route('**/config.json', route => route.fulfill({ json: { version: activity } }));
    await page.route('**/app-version.json', route => route.fulfill({ json: { version: activity } }));
    await page.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      requests.push(url.pathname);
      const json = body => route.fulfill({ json: body });
      if (url.pathname === '/api/auth/session') return json({ user: { id: person, email: 'leader@example.invalid' } });
      if (url.pathname === '/api/admin/overview') return json({ platformAdmin: false, canBootstrap: false, clubs: [], platformAdministrators: [] });
      if (url.pathname === '/api/assistant/conversations') return json([]);
      if (url.pathname === '/api/me/overview') return json({ reference_time: '2030-10-25T10:00:00Z', activities: [],
        organizations: [{ id: organization, name: 'Exempelföreningen', time_zone: 'Europe/Stockholm' }],
        teams: [{ id: team, organization_id: organization, name: 'Ledarlaget', roles: ['leader'] }, { id: familyTeam, organization_id: organization, name: 'Familjelaget', roles: ['guardian'] }],
        calendar_people: [], calendar_teams: [] });
      if (url.pathname.startsWith(`/api/teams/${familyTeam}/`)) return route.fulfill({ status: 403, json: { error: 'Denied' } });
      if (url.pathname === `/api/teams/${team}/signals`) return json([{ id: signal, activityId: activity, state: 'active', severity: 'warning', title: 'Få spelare anmälda till matchen', text: '1 av 9 spelare har tackat ja.', actions: queued ? [] : ['remind-unanswered'], revision: 1, episode: 1, evaluatedAt: '2030-10-25T10:00:00Z', history: queued ? [{ action: 'remind-unanswered', result: 'queued', createdAt: '2030-10-25T10:01:00Z' }] : [] }]);
      if (url.pathname === `/api/teams/${team}/follow-up`) return json([]);
      if (url.pathname === `/api/signals/${signal}/actions`) { assert.equal(request.postDataJSON().action, 'remind-unanswered'); queued = true; return json({}); }
      if (url.pathname === `/api/teams/${team}/roster/access`) return json(rosterAllowed);
      if (url.pathname === `/api/teams/${team}/discipline-players`) return json([{ id: person, name: 'Alex Exempel' }]);
      if (url.pathname === `/api/teams/${team}/roster` && !rosterAllowed) return route.fulfill({ status: 403, json: { error: 'Denied' } });
      if (url.pathname === `/api/teams/${team}/roster`) return json({ team: { id: team, name: 'Ledarlaget', organizationName: 'Exempelföreningen' }, people: [{ id: person, name: 'Alex Exempel', roles: ['participant'], title: 'Spelare', linked: true, guardians: [], childIds: [] }], groups: [] });
      if (url.pathname === '/api/discipline-fields') {
        if (request.method() === 'PUT') { number = request.postDataJSON().values.shirtNumber; fieldRevision++; }
        return json({ disciplineKey: 'football', version: '1.0.0', enabled: true, editable: rosterAllowed, canManageInvitations: rosterAllowed, title: 'Spelaruppgifter', revision: fieldRevision,
          fields: [{ key: 'shirtNumber', title: 'Tröjnummer', type: 'integer', minimum: 0, maximum: 999, options: [] }], values: { shirtNumber: number }, teamPlayers: [], acceptedPlayers: [], participants: [] });
      }
      return json([]);
    });
    await page.goto(frontend);
    await expect(page.getByRole('heading', { name: /För laget · Exempelföreningen · Ledarlaget/ })).toBeVisible();
    await expect(page.locator('.team-attention')).not.toContainText('Familjelaget');
    assert.ok(requests.includes(`/api/teams/${familyTeam}/signals`));
    assert.ok(await before(page, '.team-attention', '.personal-calendar-section'));
    await page.getByRole('button', { name: 'Påminn obesvarade', exact: true }).click();
    await page.getByRole('button', { name: 'Bekräfta', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Påminnelse köad för leverans.' })).toBeVisible();
    await page.locator('main').screenshot({ path: `frontend/.evidence/team-attention/home-${width}.png` });
    await page.goto(`${frontend}/teams/${team}/members?person=${person}`);
    const profile = page.locator('.members-admin-card');
    await expect(profile.getByRole('heading', { name: 'Alex Exempel', exact: true })).toBeVisible();
    await profile.getByRole('button', { name: 'Redigera spelaruppgifter', exact: true }).click();
    await profile.getByLabel('Tröjnummer', { exact: true }).fill('12');
    await profile.getByRole('button', { name: 'Spara', exact: true }).click();
    await expect(profile.getByText('12', { exact: true })).toBeVisible();
    // The extension must supplement the profile, including its ordinary name editor.
    await expect(profile.getByRole('link', { name: 'Redigera medlem', exact: true })).toBeVisible();
    await page.goto(`${frontend}/teams/${team}/members?person=${person}&edit=1`);
    await expect(page.getByLabel('Namn', { exact: true })).toBeVisible();
    await expect(page.getByText('Tröjnummer', { exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    rosterAllowed = false;
    await page.goto(`${frontend}/teams/${team}/members`);
    await page.getByText('Alex Exempel', { exact: true }).click();
    await expect(page.getByText('Tröjnummer', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Redigera spelaruppgifter', exact: true })).toHaveCount(0);
    await page.close();
    console.log(`${width}px: both galleries, personal home, permission isolation, reminder confirmation and player editing OK`);
  }
} finally { await browser.close(); }
