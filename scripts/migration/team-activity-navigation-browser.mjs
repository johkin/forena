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
    let invitationWrites = 0;
    const personId = '44444444-4444-4444-8444-444444444444';
    let activity = {
      id: '33333333-3333-4333-8333-333333333333', organization_id: organizationId, team_id: teamId,
      activity_type_id: '00000000-0000-4000-8000-000000000004', title: 'Träning F2016',
      description: '', location: 'Örvallen', starts_at: '2030-10-25T16:00:00Z', ends_at: '2030-10-25T17:00:00Z',
      gathering_at: null, status: 'scheduled', revision: 0,
    };
    const personalActivity = () => ({ ...activity, response_due_at: null,
      organization: { id: organizationId, name: team.organizationName, time_zone: team.timeZone, role: null },
      team: { id: teamId, organization_id: organizationId, name: team.name, roles: ['leader'] }, people: [],
    });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let json;
      if (path === '/api/auth/session') json = { user: { id: organizationId, email: 'en.lang.epostadress@example.invalid' } };
      else if (path === '/api/me/overview') json = {
        reference_time: new Date().toISOString(), activities: canManage ? [personalActivity()] : [],
        organizations: [{ id: organizationId, name: team.organizationName, role: null, time_zone: team.timeZone }],
        teams: [{ id: teamId, organization_id: organizationId, name: team.name, roles: ['leader'] }],
      };
      else if (path === '/api/admin/overview') json = { platformAdmin: false, canBootstrap: false, platformAdministrators: [], clubs: [] };
      else if (path === '/api/me/managed-teams') json = canManage ? [team] : [];
      else if (path === `/api/teams/${teamId}/activity-editor`) {
        editorReads++;
        json = { team, disciplineKey: null, sectionId: null, defaults: [], groups: [], members: [{ id: personId, displayName: 'Alex', role: 'participant' }], activities: [activity],
          types: [{ id: '00000000-0000-4000-8000-000000000004', name: 'Övrigt', slug: 'ovrigt', system_category: 'other', organization_id: null }] };
      } else if (path === `/api/activities/${activity.id}`) {
        if (route.request().method() === 'PUT') {
          const command = route.request().postDataJSON();
          assert.equal(command.invitationMode, 'now');
          assert.deepEqual(command.personIds, [personId]);
          assert.equal(command.revision, activity.revision);
          activity = { ...activity, revision: activity.revision + 1 };
          invitationWrites++;
          json = { activity };
        } else json = personalActivity();
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
    const security = await page.locator(mobile ? '#header-menu' : '.app-sidebar').getByRole('link', { name: 'Inloggningsinställningar' }).boundingBox();
    assert.ok(home && security && home.height >= 44 && security.y >= home.y + home.height);
    if (mobile) {
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Öppna meny' })).toBeFocused();
    }
    await page.getByRole('link', { name: /F2016/ }).click();
    await expect(page.getByRole('heading', { name: 'F2016', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Lagets aktiviteter' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ny aktivitet', exact: true })).toBeVisible();
    await expect(page.getByLabel('Lag', { exact: true })).toHaveCount(0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('button', { name: 'Ny aktivitet', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Skapa aktivitet' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('F2016', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Kallelse & svarsregler', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Aktivitetsserie', exact: true }).click();
    await expect(dialog.getByRole('group', { name: 'Serien slutar', exact: true })).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await dialog.getByRole('button', { name: 'Stäng', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Ny aktivitet', exact: true })).toBeFocused();
    await expect(page.getByRole('button', { name: /^Redigera/ })).toHaveCount(0);
    await page.getByRole('button', { name: /Träning F2016/ }).click();
    await page.getByRole('button', { name: 'Redigera', exact: true }).click();
    const editing = page.getByRole('dialog', { name: 'Redigera aktivitet', exact: true });
    await expect(editing.getByText('Kallelse & svarsregler', { exact: true })).toBeVisible();
    await editing.getByRole('button', { name: 'Välj personer', exact: true }).click();
    await editing.getByRole('checkbox', { name: /Alex/ }).check();
    await editing.getByRole('button', { name: 'Förhandsgranska', exact: true }).click();
    await editing.getByRole('button', { name: 'Spara ändring', exact: true }).click();
    await expect(editing).toHaveCount(0);
    assert.equal(invitationWrites, 1);
    await expect(page.getByRole('button', { name: 'Redigera', exact: true })).toBeFocused();
    await page.getByRole('link', { name: 'Till min översikt', exact: true }).click();
    await page.getByRole('link', { name: /F2016/ }).click();
    await expect(page.getByRole('button', { name: 'Ny aktivitet', exact: true })).toBeVisible();
    canManage = false;
    const previousReads = editorReads;
    await page.reload();
    await expect(page.getByRole('heading', { name: 'F2016', exact: true })).toBeVisible();
    await expect(page.locator('.activity-management')).toHaveCount(0);
    assert.equal(editorReads, previousReads);
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px: shared cards, details editing, atomic invitations, series, focus, permissions, no overflow`);
    await page.close();
  }
} finally {
  await browser.close();
}
