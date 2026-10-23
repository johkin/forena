import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';

// Exercise the production UI with local API fixtures; no backend writes.
const origin = process.env.FORENA_NAVIGATION_FRONTEND ?? 'http://127.0.0.1:3002';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const teamId = '11111111-1111-4111-8111-111111111111';
const organizationId = '22222222-2222-4222-8222-222222222222';
const team = { id: teamId, organizationId, name: 'F2016', organizationName: 'Exempelföreningen', timeZone: 'Europe/Stockholm', canManageInvitations: true };
const browser = await chromium.launch({ headless: true, ...(process.env.FORENA_BROWSER_EXECUTABLE ? { executablePath: process.env.FORENA_BROWSER_EXECUTABLE } : {}) });
try {
  for (const width of [320, 375, 390, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let canManage = true;
    let editorReads = 0;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let json;
      if (path === '/api/auth/session') json = { user: { id: organizationId, email: 'en.lang.epostadress@example.invalid' } };
      else if (path === '/api/me/overview') json = {
        reference_time: new Date().toISOString(), activities: [],
        organizations: [{ id: organizationId, name: team.organizationName, role: null, time_zone: team.timeZone }],
        teams: [{ id: teamId, organization_id: organizationId, name: team.name, roles: ['leader'] }],
      };
      else if (path === '/api/me/managed-teams') json = canManage ? [team] : [];
      else if (path === `/api/teams/${teamId}/activity-editor`) {
        editorReads++;
        json = { team, disciplineKey: null, sectionId: null, defaults: [], groups: [], members: [], activities: [],
          types: [{ id: '00000000-0000-4000-8000-000000000004', name: 'Övrigt', slug: 'ovrigt', system_category: 'other', organization_id: null }] };
      } else throw new Error(`Unexpected API request: ${path}`);
      await route.fulfill({ json });
    });
    await page.goto(origin);
    await expect(page.getByRole('heading', { name: 'Min översikt', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Hantera aktiviteter' })).toHaveCount(0);
    const mobile = width < 768;
    if (mobile) await page.getByRole('button', { name: 'Öppna meny' }).click();
    const navigation = page.locator(mobile ? '#header-menu' : '.app-sidebar').getByRole('navigation', { name: 'Personligt' });
    const home = await navigation.getByRole('link', { name: 'Min översikt' }).boundingBox();
    const security = await navigation.getByRole('link', { name: 'Inloggningsinställningar' }).boundingBox();
    assert.ok(home && security && home.height >= 44 && security.y >= home.y + home.height);
    if (mobile) {
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Öppna meny' })).toBeFocused();
    }
    await page.getByRole('link', { name: /F2016/ }).click();
    await expect(page.getByRole('heading', { name: 'Lagets aktiviteter' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ny aktivitet', exact: true })).toBeVisible();
    await expect(page.getByLabel('Lag', { exact: true })).toHaveCount(0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('button', { name: 'Ny aktivitet', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Skapa aktivitet' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('F2016', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Stäng', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Ny aktivitet', exact: true })).toBeFocused();
    canManage = false;
    const previousReads = editorReads;
    await page.reload();
    await expect(page.getByRole('heading', { name: 'F2016', exact: true })).toBeVisible();
    await expect(page.locator('.activity-management')).toHaveCount(0);
    assert.equal(editorReads, previousReads);
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px: menu rows, team editor, focus, permissions, no overflow`);
    await page.close();
  }
} finally {
  await browser.close();
}
