import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';

const origin = process.env.FORENA_NAVIGATION_FRONTEND ?? 'http://127.0.0.1:3005';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
const accountId = '11111111-1111-4111-8111-111111111111';
const clubId = '22222222-2222-4222-8222-222222222222';
const sectionId = '33333333-3333-4333-8333-333333333333';
const browser = await chromium.launch({ headless: true, ...(process.env.FORENA_BROWSER_EXECUTABLE ? { executablePath: process.env.FORENA_BROWSER_EXECUTABLE } : {}) });
try {
  for (const width of [320, 390, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let platformAdmin = true;
    let clubAccess = true;
    let clubName = 'Exempelklubben';
    let writes = 0;
    await page.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      let json;
      if (path === '/api/auth/session') json = { user: { id: accountId, email: 'admin@example.invalid' } };
      else if (path === '/api/admin/overview') json = { platformAdmin, canBootstrap: false, platformAdministrators: [],
        clubs: clubAccess ? [{ id: clubId, name: clubName, slug: 'exempelklubben', timeZone: 'Europe/Stockholm', canManage: true, administrators: [],
          sections: [{ id: sectionId, name: 'Fotboll', slug: 'fotboll', disciplineKey: 'football', canManage: true,
            canChangeDiscipline: true, canDelete: false, administrators: [], teams: [] }],
        }] : [],
      };
      else if (path === '/api/admin/slug') json = { status: 'available' };
      else if (path === '/api/assistant/memories') json = [];
      else if (path === `/api/assistant/profiles/${clubId}`) json = { name: 'Klubbassistenten', personality: '', instructions: '', revision: 0 };
      else if (path === `/api/assistant/profiles/${clubId}/sections/${sectionId}`) json = { instructions: '', revision: 0 };
      else if (path === `/api/admin/clubs/${clubId}` && request.method() === 'PUT') {
        assert.equal(request.headers()['x-forena-account'], accountId);
        assert.equal(request.headers()['x-forena-request'], '1');
        clubName = request.postDataJSON().name; writes++;
        json = { ok: true };
      } else throw new Error(`Unexpected API request: ${path}`);
      await route.fulfill({ json });
    });
    await page.goto(`${origin}/system`);
    await expect(page.getByRole('heading', { name: 'Systemadministration', exact: true })).toBeVisible();
    await expect(page.locator('main .system-admin-grid > a')).toHaveCount(5);
    const mobile = width < 768;
    if (mobile) await page.getByRole('button', { name: 'Öppna meny', exact: true }).click();
    const menu = page.locator(mobile ? '#header-menu' : '.app-sidebar');
    const systemMenu = menu.getByRole('navigation', { name: 'Systemadministration', exact: true });
    await expect(systemMenu.getByRole('link')).toHaveText(['System', 'Klubbar', 'Administratörer', 'Discipliner', 'Aktivitetstyper', 'Assistentminnen', 'Till Förena']);
    await expect(systemMenu.getByRole('link', { name: 'System', exact: true })).toHaveAttribute('aria-current', 'page');
    if (mobile) await page.keyboard.press('Escape');
    await page.locator('main .system-admin-grid').getByRole('link', { name: /^Klubbar/ }).click();
    await expect(page.getByRole('heading', { name: 'Klubbar', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Sök klubb', exact: true })).toBeVisible();
    await page.locator('main .system-admin-grid').getByRole('link', { name: /Exempelklubben/ }).click();
    await expect(page.getByRole('heading', { name: clubName, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Klubbens uppgifter', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Namn', exact: true }).fill('Uppdaterad klubb');
    await page.getByRole('button', { name: 'Spara klubb', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Uppdaterad klubb', exact: true })).toBeVisible();
    assert.equal(writes, 1);
    await page.getByRole('link', { name: 'Hantera lag', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Hantera lag', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lägg till lag', exact: true })).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    platformAdmin = false; clubAccess = false;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('heading', { name: 'Klubben är inte tillgänglig', exact: true })).toBeVisible();
    await page.goto(`${origin}/system`);
    await expect(page.getByText('Du saknar behörighet till systemadministrationen.', { exact: true })).toBeVisible();
    await expect(page.locator('main .system-admin-grid')).toHaveCount(0);
    if (mobile) await page.getByRole('button', { name: 'Öppna meny', exact: true }).click();
    await expect(page.locator(mobile ? '#header-menu' : '.app-sidebar').getByRole('link', { name: 'Systemadministration', exact: true })).toHaveCount(0);
    clubAccess = true;
    await page.goto(`${origin}/organizations/${clubId}/administration`);
    await expect(page.getByRole('heading', { name: clubName, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Spara klubb', exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px: canonical system menu, overview, clubs, sections, team navigation, writes and revoked access`);
    await page.close();
  }
} finally { await browser.close(); }
